// app.js

// Initialize the map
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(
  new maplibregl.GeolocateControl({ trackUserLocation: true }),
  "bottom-right"
);

// Element getters
const $ = (id) => document.getElementById(id);
const searchInput       = $("search"),
      suggestionsEl     = $("suggestions"),
      recentEl          = $("recent-searches"),
      panel             = $("side-panel"),
      closeBtn          = $("close-side-panel"),
      panelArrow        = $("panel-arrow"),
      panelSearch       = $("panel-search-icon"),
      placeName         = $("place-name"),
      placeDesc         = $("place-description"),
      placeWeather      = $("place-weather"),
      placeImages       = $("place-images"),
      directionsBtn     = $("directions-btn"),
      placeInfoSection  = $("place-info-section"),
      directionsSection = $("directions-section"),
      directionsForm    = $("directions-form"),
      fromInput         = $("from-input"),
      toInput           = $("to-input"),
      fromSug           = $("from-suggestions"),
      toSug             = $("to-suggestions"),
      directionsResult  = $("directions-result"),
      backToInfoBtn     = $("back-to-info-btn"),
      routeSection      = $("route-section"),
      routeStepsEl      = $("route-steps"),
      exitRouteBtn      = $("exit-route-btn");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
let fromCoords = null, toCoords = null;

// debounce helper
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// Nominatim lookup
async function fetchNominatim(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent":"TheBoiisMCMaps/1.0", Referer:"https://maps.theboiismc.com" } }
  );
  const arr = await res.json();
  return arr.map(r => ({ name:r.display_name, lat:+r.lat, lon:+r.lon }));
}

// Recent logic
function saveRecent(p) {
  recentSearches = recentSearches.filter(r => r.name !== p.name);
  recentSearches.unshift(p);
  if (recentSearches.length>10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuseRecent = new Fuse(recentSearches, { keys:["name"], threshold:0.3 });
}
function showRecent() {
  suggestionsEl.style.display = "none";
  if (!searchInput.value.trim() && recentSearches.length) {
    recentEl.innerHTML="";
    recentSearches.forEach(p=>{
      const d=document.createElement("div");
      d.className="suggestion recent";
      d.textContent = p.name;
      d.onclick = ()=> selectPlace(p);
      recentEl.appendChild(d);
    });
    recentEl.style.display="block";
  }
}
function renderSuggestions(list, container, setter) {
  container.innerHTML="";
  list.forEach(p=>{
    const d=document.createElement("div");
    d.className="suggestion";
    d.textContent=p.name;
    d.onclick=()=>{ setter(p); container.style.display="none"; };
    container.appendChild(d);
  });
  container.style.display = list.length?"block":"none";
}

// Panel toggle
function togglePanel(open) {
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", (!open).toString());
  map.resize();
}
closeBtn.onclick = ()=>togglePanel(false);
panelArrow.onclick = ()=>togglePanel(!panel.classList.contains("open"));
panelSearch.onclick = ()=>searchInput.focus();

// Main search wiring
searchInput.addEventListener("focus", showRecent);
searchInput.addEventListener("input", debounce(async()=>{
  const q = searchInput.value.trim();
  if (!q) return showRecent();
  let list = fuseRecent.search(q).map(r=>r.item);
  if (list.length<5) (await fetchNominatim(q)).forEach(e=>{
    if (!list.find(r=>r.name===e.name)) list.push(e);
  });
  renderSuggestions(list, suggestionsEl, selectPlace);
},150));
document.addEventListener("click", e=>{
  if (!e.target.closest(".search-bar")&&!e.target.closest("#suggestions")&&!e.target.closest("#recent-searches")) {
    suggestionsEl.style.display=recentEl.style.display="none";
  }
});

// Directions autocompletes
fromInput.addEventListener("input", debounce(async()=>{
  const q=fromInput.value.trim(); if(!q) return fromSug.style.display="none";
  const list=await fetchNominatim(q);
  renderSuggestions(list, fromSug, p=>{
    fromInput.value=p.name; fromCoords=[p.lon,p.lat];
  });
},200));
toInput.addEventListener("input", debounce(async()=>{
  const q=toInput.value.trim(); if(!q) return toSug.style.display="none";
  const list=await fetchNominatim(q);
  renderSuggestions(list, toSug, p=>{
    toInput.value=p.name; toCoords=[p.lon,p.lat];
  });
},200));
document.addEventListener("click",e=>{
  if (!e.target.closest("#directions-section")) fromSug.style.display=toSug.style.display="none";
});

// Place select
async function selectPlace(p) {
  currentPlace=p; saveRecent(p);
  searchInput.value=p.name;
  if (window.placeMarker) placeMarker.remove();
  window.placeMarker=new maplibregl.Marker().setLngLat([p.lon,p.lat]).addTo(map);
  map.flyTo({center:[p.lon,p.lat],zoom:13});
  await loadPlaceInfo(p);
  placeInfoSection.hidden=false;
  directionsSection.hidden=true;
  routeSection.hidden=true;
  togglePanel(true);
}

// Load info
async function loadPlaceInfo(p) {
  placeName.textContent=p.name;
  placeDesc.textContent="Loading...";
  placeWeather.textContent="";
  placeImages.innerHTML="";

  // Wikipedia summary
  try {
    const res=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.name)}`);
    const data=await res.json();
    const s=data.extract.match(/[^\.!\?]+[\.!\?]+/g)||[data.extract];
    let brief=s.slice(0,3).join(" ").trim();
    if (brief.length>300) brief=brief.slice(0,300).trim()+"…";
    placeDesc.textContent=brief||"No description.";
  } catch{ placeDesc.textContent="No description."; }

  // Wikipedia images
  try {
    const pg=await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(p.name)}&format=json&origin=*`);
    const j=await pg.json();
    const page=j.query.pages[Object.keys(j.query.pages)[0]];
    const imgs=(page.images||[]).slice(0,5);
    for (let img of imgs) {
      if (/\.(jpg|jpeg|png)$/i.test(img.title)) {
        const info=await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`);
        const inf=await info.json();
        const url=inf.query.pages[Object.keys(inf.query.pages)[0]].imageinfo[0].url;
        const el=document.createElement("img"); el.src=url; el.alt=p.name;
        placeImages.appendChild(el);
      }
    }
  } catch{}

  // Weather
  try {
    const wr=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current_weather=true`);
    const wj=await wr.json();
    if (wj.current_weather) placeWeather.textContent=`Temp: ${wj.current_weather.temperature}°C, Wind: ${wj.current_weather.windspeed} km/h`;
    else placeWeather.textContent="No weather.";
  } catch{ placeWeather.textContent="No weather."; }
}

// Show directions mode
directionsBtn.onclick=()=>{
  placeInfoSection.hidden=true;
  directionsSection.hidden=false;
  routeSection.hidden=true;
  fromInput.value=""; toInput.value=currentPlace.name;
  fromCoords=null; toCoords=[currentPlace.lon,currentPlace.lat];
  directionsResult.textContent="";
};

// Back & Exit
backToInfoBtn.onclick=()=>{
  directionsSection.hidden=true;
  placeInfoSection.hidden=false;
};
exitRouteBtn.onclick=()=>{
  routeSection.hidden=true;
  placeInfoSection.hidden=false;
  if (map.getSource("route")) {
    map.removeLayer("route-line");
    map.removeSource("route");
  }
};

// Route fetch & draw
directionsForm.onsubmit=async e=>{
  e.preventDefault();
  directionsResult.textContent="Routing…";
  try {
    if (!fromCoords) throw Error("Pick a valid From");
    if (!toCoords) throw Error("Pick a valid To");
    const res=await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({coordinates:[fromCoords,toCoords]})
    });
    const geo=await res.json();
    const steps=geo.features[0].properties.segments[0].steps;

    // draw
    if (map.getSource("route")) {
      map.removeLayer("route-line"); map.removeSource("route");
    }
    map.addSource("route",{type:"geojson",data:geo});
    map.addLayer({id:"route-line",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-width":4,"line-color":"#1a73e8"} });

    // list
    routeStepsEl.innerHTML="";
    steps.forEach(s=>{
      const li=document.createElement("li"); li.textContent=s.instruction;
      routeStepsEl.appendChild(li);
    });

    directionsSection.hidden=true;
    routeSection.hidden=false;
  } catch(err){
    directionsResult.textContent="Error: "+err.message;
  }
};

// Init panel state
window.addEventListener("load",()=>{
  if (window.innerWidth>768) togglePanel(false);
  else {
    panel.style.bottom=`calc(-1*(var(--panel-mobile-height)-var(--panel-mobile-peek)))`;
    panel.setAttribute("aria-hidden","false");
  }
});
window.addEventListener("resize",()=>{
  if (window.innerWidth>768 && !panel.classList.contains("open")) {
    panel.style.left=`calc(-1*var(--panel-width))`;
    panel.setAttribute("aria-hidden","true");
  }
  if (window.innerWidth<=768 && !panel.classList.contains("open")) {
    panel.style.bottom=`calc(-1*(var(--panel-mobile-height)-var(--panel-mobile-peek)))`;
    panel.setAttribute("aria-hidden","false");
  }
});
document.addEventListener("keydown",e=>{
  if (e.key==="Escape"&&panel.classList.contains("open")) togglePanel(false);
});

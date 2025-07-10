// map init
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95.7129,37.0902],
  zoom:4
});

// controls bottom-right
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions:{enableHighAccuracy:true},
  trackUserLocation:true,
  showAccuracyCircle:false
}), 'bottom-right');

// DOM refs
const $ = id => document.getElementById(id);

const search = $('search'),
      suggestions = $('suggestions'),
      searchIcon = $('search-icon'),
      directionsIcon = $('directions-icon'),
      sidePanel = $('side-panel'),
      closeSidePanel = $('close-side-panel'),
      placeInfo = $('place-info'),
      placeName = $('place-name'),
      placeDescription = $('place-description'),
      placeWeather = $('place-weather'),
      directionsBtn = $('directions-btn'),
      directionsForm = $('directions-form'),
      origin = $('origin'),
      destination = $('destination'),
      swapBtn = $('swap-locations'),
      getRoute = $('get-route');

let currentPlace = null;

// debounce
const debounce = (fn, d) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),d); }; };

// hide suggestions
const clearSug = () => { suggestions.textContent=''; suggestions.style.display='none'; };

// Photon API
async function photonSearch(q){
  if(!q) return [];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
    if(!res.ok) return [];
    const d = await res.json();
    return d.features || [];
  } catch {return [];}
}

// wiki summary
async function fetchDesc(n){
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(n)}`);
    if(!res.ok) return null;
    const d = await res.json();
    return d.extract || null;
  } catch {return null;}
}

// weather
async function fetchWeather(lat,lon){
  const key='YOUR_OPENWEATHERMAP_API_KEY';
  try {
    const res=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`);
    if(!res.ok) return null;
    const d=await res.json();
    return `Weather: ${d.weather?.[0]?.description||''}, Temp: ${d.main?.temp||''}°C`;
  } catch {return null;}
}

// render suggestions
async function renderSug(q){
  const feats = await photonSearch(q);
  clearSug();
  if(!feats.length) return;
  feats.forEach(f=>{
    const d = document.createElement('div');
    d.textContent = `${f.properties.name}${f.properties.state?`,${f.properties.state}:''}${f.properties.country?`, ${f.properties.country}:''}`;
    d.className='suggestion';
    d.tabIndex=0;
    const [lon,lat]=f.geometry.coordinates;
    d.onclick=async ()=>{
      search.value=d.textContent;
      search.dataset.lon=lon;
      search.dataset.lat=lat;
      clearSug();
      currentPlace=f;
      await showPlaceInfo(f);
      flyTo(lon,lat);
    };
    d.onkeydown=e=>{ if(e.key==='Enter'){d.click();}};
    suggestions.appendChild(d);
  });
  suggestions.style.display='block';
}

// fly map
const flyTo=(lon,lat)=> map.flyTo({center:[lon,lat],zoom:14});

// show info panel
async function showPlaceInfo(f){
  currentPlace=f;
  placeInfo.style.display='block';
  directionsForm.style.display='none';
  sidePanel.classList.add('open');
  placeName.textContent=f.properties.name;
  placeDescription.textContent=await fetchDesc(f.properties.name) || 'No description found.';
  const [lon,lat]=f.geometry.coordinates;
  placeWeather.textContent = await fetchWeather(lat,lon) || 'Weather unavailable.';
}

// toggle directions form
function showDirForm(){
  placeInfo.style.display='none';
  directionsForm.style.display='block';
  if(currentPlace){
    destination.value=currentPlace.properties.name;
    const [lon,lat]=currentPlace.geometry.coordinates;
    destination.dataset.lon=lon;
    destination.dataset.lat=lat;
  }
}

// close panel
closeSidePanel.onclick = () => sidePanel.classList.remove('open');

// search icon click
searchIcon.onclick = () => {
  const lon=parseFloat(search.dataset.lon),
        lat=parseFloat(search.dataset.lat);
  if(!lon||!lat) return alert('Select a place first.');
  flyTo(lon,lat);
  if(currentPlace) showPlaceInfo(currentPlace);
};

// directions icon click
directionsIcon.onclick = () => {
  if(!currentPlace) return alert('Select a place first.');
  sidePanel.classList.add('open');
  showDirForm();
};

// btns
directionsBtn.onclick = showDirForm;

swapBtn.onclick = ()=>{
  const ov=origin.value, dv=destination.value;
  const ol=origin.dataset.lon, ot=origin.dataset.lat;
  const dl=destination.dataset.lon, dt=destination.dataset.lat;
  origin.value=dv;
  origin.dataset.lon=dl;
  origin.dataset.lat=dt;
  destination.value=ov;
  destination.dataset.lon=ol;
  destination.dataset.lat=ot;
};

// routing
async function fetchRoute(oLon,oLat,dLon,dLat){
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson`);
    if(!r.ok) throw 0;
    const j = await r.json();
    if(j.code!=='Ok'||!j.routes.length) return null;
    return j.routes[0];
  } catch{
    alert('No route found.');
    return null;
  }
}
function draw(r){
  const gj={type:'Feature',geometry:r.geometry};
  if(map.getSource('route')){
    map.getSource('route').setData(gj);
  } else {
    map.addSource('route',{type:'geojson',data:gj});
    map.addLayer({
      id:'route', type:'line', source:'route',
      layout:{'line-join':'round','line-cap':'round'},
      paint:{'line-color':'#6750a4','line-width':6,'line-opacity':0.8}
    });
  }
}
getRoute.onclick = async ()=>{
  const oLon=parseFloat(origin.dataset.lon),
        oLat=parseFloat(origin.dataset.lat),
        dLon=parseFloat(destination.dataset.lon),
        dLat=parseFloat(destination.dataset.lat);
  if(isNaN(oLon)||isNaN(oLat)||isNaN(dLon)||isNaN(dLat)){
    return alert('Select valid origin and destination.');
  }
  const route = await fetchRoute(oLon,oLat,dLon,dLat);
  if(route) draw(route), flyTo(oLon,oLat);
};

// search events
search.oninput = debounce(e=>renderSug(e.target.value.trim()),300);
search.onblur = ()=>setTimeout(clearSug,200);

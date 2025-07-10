<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TheBoiisMC Map</title>
    <link href="https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.css" rel="stylesheet" />
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap');

        html, body {
            margin: 0; padding: 0; height: 100%; width: 100%;
            font-family: 'Roboto', sans-serif;
            background: #f2f2f2; color: #202124;
        }

        #map {
            position: absolute; top: 0; bottom: 0; left: 0; right: 0; z-index: 0;
        }

        .search-bar {
            position: absolute;
            top: 20px; left: 20px;
            width: 320px;
            background: #fff;
            border-radius: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 10001;
        }

        .search-wrapper {
            position: relative;
            width: 100%;
        }

        .search-wrapper input {
            font-size: 16px;
            padding: 10px 16px;
            padding-right: 44px;
            width: 280px; /* Your updated width */
            border: none;
            border-radius: 20px;
            background: #e7e0ec;
            color: #1c1b1f;
        }

        #search-icon {
            position: absolute;
            right: 8px; /* Moved icon far right but inside search bar */
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #333;
        }

        #suggestions {
            max-height: 240px;
            overflow-y: auto;
        }

        .suggestion {
            padding: 8px 16px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        }

        .suggestion:hover, .suggestion:focus {
            background-color: #d6cfff;
            outline: none;
        }

        /* Directions / Navigation panel */
        #directions-form {
            position: fixed;
            top: 0;
            left: -360px; /* Start off-screen */
            height: 100%;
            width: 350px;
            background: #fff;
            box-shadow: 2px 0 12px rgba(0,0,0,0.15);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            z-index: 10002;
            transition: left 0.3s ease-in-out; /* Smooth transition */
        }

        #directions-form.open {
            left: 0; /* Slide in */
        }

        .directions-header {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        #close-directions { /* Now the hamburger menu icon */
            font-size: 24px;
            background: none;
            border: none;
            cursor: pointer;
            color: #333;
            padding: 0;
        }

        .travel-modes {
            display: flex;
            justify-content: space-around;
            width: 100%;
            background-color: #f2f2f2;
            border-radius: 20px;
            padding: 4px;
        }

        .travel-mode {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            padding: 8px 12px;
            border-radius: 16px;
            transition: background-color 0.2s;
        }

        .travel-mode.active {
            background-color: #e0e0e0;
        }

        #directions-inputs {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .input-row {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #f2f2f2;
            border-radius: 8px;
            padding: 0 12px;
        }

        .input-row .input-icon {
            font-size: 18px;
            color: #5f6368;
        }

        #directions-form input {
            width: 100%;
            padding: 12px 0;
            font-size: 16px;
            border: none;
            background: transparent;
            outline: none;
        }

        #swap-locations {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #5f6368;
        }

        .delays-info {
            border-top: 1px solid #e0e0e0;
            padding-top: 16px;
            font-size: 14px;
            color: #5f6368;
        }

        .delays-info p {
            margin: 4px 0;
        }

        .delays-info strong {
            color: #202124;
        }

        /* Keep old buttons for functionality, but hide them initially */
        #get-route, #clear-route {
             background-color: #6750a4;
             color: white;
             padding: 12px 20px;
             border-radius: 20px;
             border: none;
             cursor: pointer;
             font-weight: 500;
             margin-top: 8px;
        }
        #clear-route { background-color: #b3261e; }
        #clear-route:hover { background-color: #9b1d14; }
        #get-route:hover { background-color: #4a3d87; }


        #route-info {
            margin-top: 8px;
            font-weight: 500;
        }

        /* Style toggle button - bottom left */
        #style-toggle {
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 72px;
            height: 72px;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: #333;
            z-index: 10000;
            user-select: none;
            transition: left 0.3s ease-in-out;
        }

        #style-toggle img {
            width: 40px;
            height: 40px;
            margin-bottom: 4px;
            object-fit: contain;
        }

        /* Directions toggle button - bottom right */
        #directions-toggle {
            position: fixed;
            bottom: 140px; /* bumped up to avoid overlapping map controls */
            right: 20px;
            background-color: #6750a4;
            color: white;
            border: none;
            border-radius: 20px;
            padding: 12px 20px;
            cursor: pointer;
            font-weight: 600;
            z-index: 10001;
            user-select: none;
        }

        /* Nav steps UI inside directions panel */
        #navigation-ui {
            margin-top: 12px;
        }

        #navigation-steps {
            font-size: 14px;
            color: #202124;
            max-height: 220px;
            overflow-y: auto;
            margin-bottom: 8px;
        }

        .nav-step {
            padding: 6px 8px;
            border-bottom: 1px solid #ddd;
        }

        .nav-step.current-step {
            background-color: #d6cfff;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div id="map"></div>

    <div class="search-bar" role="search" aria-label="Main search">
        <div class="search-wrapper">
            <input id="search" type="text" placeholder="Search city, state, place..." autocomplete="off" spellcheck="false" aria-label="Search for destination" />
            <button id="search-icon" aria-label="Search"><span>🔍</span></button>
        </div>
        <div id="suggestions" role="listbox" tabindex="-1"></div>
    </div>

    <button id="directions-toggle" aria-pressed="false" aria-label="Toggle directions panel">Directions</button>

    <div id="directions-form">
        <div class="directions-header">
            <button id="close-directions" aria-label="Close directions panel">☰</button>
            <div class="travel-modes">
                <button class="travel-mode active" aria-label="Driving">🚗</button>
                <button class="travel-mode" aria-label="Walking">🚶</button>
            </div>
        </div>

        <div id="directions-inputs">
            <div class="input-row">
                <input id="origin" type="text" placeholder="Starting point" />
                <button id="origin-location">📍</button>
            </div>
            <div class="input-row">
                <input id="destination" type="text" placeholder="Destination" />
                <button id="destination-location">📍</button>
            </div>
            <button id="swap-locations">↔️</button>
        </div>

        <div id="route-info"></div>

        <div class="delays-info">
            <p><strong>Delays</strong>: 5 min</p>
            <p><strong>ETA</strong>: 13:12</p>
        </div>

        <button id="get-route">Get Route</button>
        <button id="clear-route">Clear Route</button>

        <div id="navigation-ui">
            <div id="navigation-steps"></div>
            <button id="start-navigation">Start Navigation</button>
            <button id="stop-navigation">Stop Navigation</button>
        </div>
    </div>

    <script src="https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.js"></script>
    <script src="app.js"></script>
</body>
</html>

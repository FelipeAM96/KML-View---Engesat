// Base layers
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
});

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 19
});

const INITIAL_CENTER = [-14.2350, -51.9253]; // Centro aproximado do Brasil
const INITIAL_ZOOM = 4; // Zoom adequado para visualizar o país

const map = L.map('map', {
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  layers: [satellite]
});

// Camada visual dos estados — apenas visual, sem interação
fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: 'black',     // contorno preto
        weight: 1,
        fillOpacity: 0      // sem preenchimento
      },
      interactive: false   // desativa clique, hover, edição
    }).addTo(map);
  })
  .catch(err => console.error('Erro ao carregar GeoJSON:', err));

// "Home" button
const homeControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    container.title = "Voltar à visão inicial";
    container.style.backgroundImage = "url('https://img.icons8.com/material-rounded/24/home.png')";
    container.onclick = function () {
      map.setView(INITIAL_CENTER, INITIAL_ZOOM);
    };
    return container;
  }
});
map.addControl(new homeControl());

const baseMaps = {
  "Mapa": osm,
  "Satélite": satellite
};
L.control.layers(baseMaps).addTo(map);

// Geocoder
L.Control.geocoder({
  defaultMarkGeocode: false
})
.on('markgeocode', function(e) {
  const bbox = e.geocode.bbox;
  const poly = L.polygon([
    bbox.getSouthEast(),
    bbox.getNorthEast(),
    bbox.getNorthWest(),
    bbox.getSouthWest()
  ]);
  map.fitBounds(poly.getBounds());
})
.addTo(map);

map.locate({ setView: true, maxZoom: 12 });

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: {
    polygon: true,
    polyline: false,
    rectangle: false,
    circle: false,
    marker: false,
    circlemarker: false
  }
});
map.addControl(drawControl);

const infoPanel = document.getElementById('info-panel');
const areaInfo = document.getElementById('area-info');
const fileInfo = document.getElementById('file-info');
const fileInput = document.getElementById('kmlFile');

let currentKmlFileName = null;

function calculaAreaKm2(layer) {
  const geojson = layer.toGeoJSON();
  if (!geojson.geometry) return 0;

  let area_m2 = 0;

  const calcularAreaPoligono = (coordinates) => {
    const latlngs = coordinates.map(c => L.latLng(c[1], c[0]));
    return L.GeometryUtil.geodesicArea(latlngs);
  };

  if (geojson.geometry.type === "Polygon") {
    area_m2 = calcularAreaPoligono(geojson.geometry.coordinates[0]);
  } else if (geojson.geometry.type === "MultiPolygon") {
    for (const polygon of geojson.geometry.coordinates) {
      area_m2 += calcularAreaPoligono(polygon[0]);
    }
  }

  return area_m2 / 1e6; // km²
}

function calcularAreaTotalKm2() {
  let total = 0;
  drawnItems.eachLayer(layer => {
    total += parseFloat(calculaAreaKm2(layer));
  });
  return total.toFixed(3);
}

function atualizaInfoPanel(fileName = null) {
  const areaTotal = calcularAreaTotalKm2();
  areaInfo.textContent = `Área Total: ${areaTotal} km²`;
  fileInfo.textContent = fileName ? `Arquivo: ${fileName}` : '';
  infoPanel.style.display = (drawnItems.getLayers().length > 0) ? 'block' : 'none';
}


function exportaPoligonoComoKML(layer, nome = 'poligono') {
  const feature = layer.toGeoJSON();
  feature.properties = feature.properties || {};
  feature.properties.name = nome;

  const geojson = {
    type: "FeatureCollection",
    features: [feature]
  };

  const kml = tokml(geojson);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome.replace(/\s+/g, "_")}.kml`;
  a.click();

  URL.revokeObjectURL(url);
}

function addPolygonToList(layer) {
  const polygonList = document.getElementById('polygon-list');
  const li = document.createElement('li');

  let nome = layer.feature?.properties?.name;
  if (!nome) {
    nome = `Polígono ${polygonList.children.length + 1}`;
    layer.feature = layer.feature || { type: "Feature", properties: {} };
    layer.feature.properties.name = nome;
  }

  const areaKm2 = calculaAreaKm2(layer);
  li.innerHTML = `<strong>${nome}</strong> - ${areaKm2.toFixed(3)} km²`;

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Exportar KML';
  exportBtn.style.marginLeft = '10px';
  exportBtn.onclick = () => exportaPoligonoComoKML(layer, nome);
  li.appendChild(exportBtn);

  const delBtn = document.createElement('button');
  delBtn.textContent = 'Excluir';
  delBtn.style.marginLeft = '5px';
  delBtn.onclick = () => {
    if (confirm(`Tem certeza que deseja excluir o polígono "${nome}"?`)) {
      drawnItems.removeLayer(layer);
      li.remove();
      atualizaInfoPanel(currentKmlFileName);
    }
  };
  li.appendChild(delBtn);

  polygonList.appendChild(li);
}

map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;

  drawnItems.addLayer(layer);

  const nome = prompt('Digite um nome para o polígono:', `Polígono ${document.getElementById('polygon-list').children.length + 1}`) || `Polígono ${document.getElementById('polygon-list').children.length + 1}`;

  layer.feature = layer.feature || { type: 'Feature', properties: {} };
  layer.feature.properties.name = nome;

  addPolygonToList(layer);
  atualizaInfoPanel();
});

// Importar KML
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  currentKmlFileName = file.name;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parser = new DOMParser();
      const kml = parser.parseFromString(e.target.result, 'text/xml');
      const geojson = toGeoJSON.kml(kml);

      if (!geojson || !geojson.features || geojson.features.length === 0) {
        alert('O arquivo KML não contém geometrias válidas para importar.');
        return;
      }

      drawnItems.clearLayers();
      document.getElementById('polygon-list').innerHTML = '';

      const tempLayer = L.geoJSON(geojson);
      map.addLayer(tempLayer);

      let hasValidPolygons = false;
      tempLayer.eachLayer(l => {
        const type = l.feature?.geometry?.type;
        if (type === 'Polygon' || type === 'MultiPolygon') {
          drawnItems.addLayer(l);
          addPolygonToList(l);
          hasValidPolygons = true;
        }
      });

      if (hasValidPolygons) {
        map.fitBounds(drawnItems.getBounds());
      } else {
        alert('O arquivo KML não contém polígonos para importar.');
      }
      map.removeLayer(tempLayer);

      atualizaInfoPanel(currentKmlFileName);
    } catch (error) {
      alert('Erro ao processar o arquivo KML: ' + error.message);
      console.error('KML processing error:', error);
    }
  };
  reader.readAsText(file);
});

// Botão de zoom para todos os polígonos
const zoomPolygonsControl = L.Control.extend({
  options: { position: 'topleft' },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    container.title = "Zoom para polígonos";
    container.style.backgroundImage = "url('https://img.icons8.com/material-rounded/24/zoom-in.png')";
    container.style.backgroundRepeat = "no-repeat";
    container.style.backgroundPosition = "center";
    container.style.width = "34px";
    container.style.height = "34px";
    container.style.cursor = "pointer";

    container.onclick = function () {
      if (drawnItems.getLayers().length === 0) {
        alert('Nenhum polígono para fazer zoom!');
        return;
      }

      const groupBounds = L.latLngBounds();
      drawnItems.eachLayer(layer => {
        if (layer.getBounds) {
          groupBounds.extend(layer.getBounds());
        }
      });

      map.fitBounds(groupBounds);
    };

    return container;
  }
});
map.addControl(new zoomPolygonsControl());

// Atualizar lista de polígonos
function atualizaListaPoligonos() {
  const polygonList = document.getElementById('polygon-list');
  polygonList.innerHTML = '';
  drawnItems.eachLayer(layer => {
    addPolygonToList(layer);
  });
}

// ---- ALTERAÇÃO PRINCIPAL: USAR EVENTO draw:edited SEM CHAMAR disable() ----

// Atualiza área e lista após edição (modo edição fecha automaticamente)
map.on('draw:edited', function (e) {
  atualizaListaPoligonos();
  atualizaInfoPanel(currentKmlFileName);
});

// Só pra garantir que ao sair do modo edição, o console mostre algo (opcional)
map.on('draw:editstop', function(e) {
  console.log('Edição finalizada e modo edição encerrado.');
});

// Remover quaisquer chamadas manuais de disable() — isso evita o erro "Click do cancel do undo changes"

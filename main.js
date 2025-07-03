let map = L.map('map').setView([30.32622, 78.06488], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20
}).addTo(map);

// Predefined substations
const substations = [
  { name: "Dakpatti",        lat: 30.3572, lng: 78.0789 },
  { name: "Anarwala",        lat: 30.3527, lng: 78.0703 },
  { name: "Hathibarkala",    lat: 30.3520, lng: 78.0534 },
  { name: "Sahastradhara",   lat: 30.3285, lng: 78.0828 },
  { name: "Landour",         lat: 30.3037, lng: 78.0710 },
  { name: "Kyarkulli",       lat: 30.3102, lng: 78.0598 },
  { name: "Kunj Bhawan",     lat: 30.3241, lng: 78.0426 },
  { name: "LBS Mussorie",    lat: 30.4525, lng: 78.0665 },
  { name: "Kargi",           lat: 30.2999, lng: 78.0211 },
  { name: "Turner Road",     lat: 30.3214, lng: 78.0547 },
  { name: "Kaulagarh",       lat: 30.3258, lng: 78.0313 },
  { name: "Vasant Vihar",    lat: 30.3040, lng: 78.0447 },
  { name: "Niranjanpur",     lat: 30.2842, lng: 78.0518 },
  { name: "Parade Ground",   lat: 30.3174, lng: 78.0322 },
  { name: "Bindal",          lat: 30.3360, lng: 78.0355 },
  { name: "Govindgarh",      lat: 30.3235, lng: 78.0359 },
  { name: "Patel Road",      lat: 30.3158, lng: 78.0324 },
  { name: "Nehru Colony",    lat: 30.3191, lng: 78.0389 },
  { name: "Doordarshan Kendra", lat: 30.3247, lng: 78.0410 },
  { name: "EC Road",         lat: 30.3252, lng: 78.0295 },
  { name: "Raipur",          lat: 30.3020, lng: 78.0472 },
  { name: "Ajabpur",         lat: 30.1740, lng: 78.0500 },
  { name: "Miyawala",        lat: 30.1620, lng: 78.0480 },
  { name: "Ring Road Raipur",lat: 30.3005, lng: 78.0475 },
  { name: "Chalang",         lat: 30.2930, lng: 78.0420 },
  { name: "Selaqui",         lat: 30.2320, lng: 78.0980 },
  { name: "Pharma City",     lat: 30.2280, lng: 78.0930 },
  { name: "Mohanpur",        lat: 30.2340, lng: 78.1120 },
  { name: "Ganeshpur",       lat: 30.2400, lng: 78.1180 },
  { name: "Jhajhra",         lat: 30.2800, lng: 78.1150 }
];

substations.forEach(s => {
  const icon = L.divIcon({
    html: `<div class="marker-label power-icon">⚡</div>`,
    iconSize: [30, 30]
  });
  L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(s.name);
});

let nodes = [];
let addingMode = false;
let markers = [];
let polylines = [];
let backupPolylines = [];
let currentMSTData = null;
let failedEdgePolyline = null;

// Add House Mode
function enableAddMode() {
  addingMode = true;
  map.getContainer().style.cursor = 'crosshair';
  document.querySelector('button[onclick="enableAddMode()"]').innerText = "👆 Click to place houses";
}

// Add House Marker
function addHouseMarker(lat, lon) {
  nodes.push([lat, lon]);
  const icon = L.divIcon({
    html: `<div class="marker-label">🏠 ${nodes.length}</div>`,
    iconSize: [30, 30],
  });

  const marker = L.marker([lat, lon], { icon, draggable: true }).addTo(map);
  marker.on('dragend', function (e) {
    const newLatLng = marker.getLatLng();
    const index = nodes.length - 1;
    nodes[index] = [newLatLng.lat, newLatLng.lng];
    
    // Regenerate MST if it exists
    if (currentMSTData) {
      sendNodesAndDrawMST();
    }
  });

  markers.push(marker);
}

// Map click to add house
map.on('click', function (e) {
  if (addingMode) {
    addHouseMarker(e.latlng.lat, e.latlng.lng);
  }
});

// Edge click handler for failure simulation
function handleEdgeClick(edge, polyline, edgeIndex) {
  return function(e) {
    if (!currentMSTData) return;
    
    // Clear previous backup visualization
    clearBackup();
    
    // Highlight the failed edge
    if (failedEdgePolyline) {
      failedEdgePolyline.setStyle({color: 'blue', weight: 4});
    }
    
    failedEdgePolyline = polyline;
    polyline.setStyle({color: 'red', weight: 6});
    polyline.bindPopup(`🚨 Simulating failure of this edge<br>Distance: ${edge.distance.toFixed(2)}m`).openPopup();
    
    // Simulate edge failure
    simulateEdgeFailure(edge);
  };
}

// Simulate edge failure and show backup MST
async function simulateEdgeFailure(failedEdge) {
  try {
    const costPerMeter = parseFloat(document.getElementById("costPerMeter").value);
    
    const response = await fetch('http://127.0.0.1:5000/simulate_failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes,
        cost_per_meter: costPerMeter,
        substations,
        fail: {
          start: failedEdge.start,
          end: failedEdge.end
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      showFailureAnalysis({
        error: data.error,
        impact: "CRITICAL",
        message: "Network becomes disconnected"
      });
      return;
    }
    
    // Draw backup MST
    if (data.edges) {
      data.edges.forEach((edge, idx) => {
        const line = L.polyline([edge.start, edge.end], {
          color: '#9400D3',
          weight: 3,
          opacity: 0.8,
          dashArray: '10,5',
          className: 'backup-edge'
        }).addTo(map);
        
        line.bindPopup(`🔄 Backup Edge ${idx + 1}<br>Distance: ${edge.distance.toFixed(2)}m`);
        backupPolylines.push(line);
      });
      
      
      // Show backup results
      const backupDiv = document.getElementById("backupResults");
      backupDiv.style.display = "block";
      backupDiv.innerHTML = `
        <strong>🔄 Backup Network Active</strong><br>
        📏 Backup Length: ${data.total_length.toFixed(2)} m<br>
        💰 Backup Cost: ₹${data.total_cost.toFixed(2)}<br>
        📊 Cost Increase: ₹${(data.total_cost - currentMSTData.total_cost).toFixed(2)}
        
      `;
      
      // Calculate failure impact
      const costIncrease = ((data.total_cost - currentMSTData.total_cost) / currentMSTData.total_cost) * 100;
      let impact = "LOW";
      if (costIncrease > 50) impact = "HIGH";
      else if (costIncrease > 20) impact = "MEDIUM";
      
      showFailureAnalysis({
        impact,
        costIncrease: costIncrease.toFixed(1),
        originalCost: currentMSTData.total_cost.toFixed(2),
        backupCost: data.total_cost.toFixed(2),
        reliability: impact === "LOW" ? "GOOD" : impact === "MEDIUM" ? "MODERATE" : "POOR"
      });
    }
    
  } catch (error) {
    console.error('Failure simulation error:', error);
    showFailureAnalysis({
      error: "Communication error with backend",
      impact: "UNKNOWN"
    });
  }
}

// Show failure analysis
function showFailureAnalysis(analysis) {
  const analysisDiv = document.getElementById("failureAnalysis");
  analysisDiv.style.display = "block";
  
  if (analysis.error) {
    analysisDiv.innerHTML = `
      <strong>⚠️ Failure Analysis</strong><br>
      <span style="color: red;">Error: ${analysis.error}</span><br>
      Impact Level: ${analysis.impact}
    `;
  } else {
    analysisDiv.innerHTML = `
      <strong>📊 Failure Impact Analysis</strong><br>
      Impact Level: <span style="color: ${getImpactColor(analysis.impact)};">${analysis.impact}</span><br>
      Cost Increase: ${analysis.costIncrease}%<br>
      Original: ₹${analysis.originalCost} → Backup: ₹${analysis.backupCost}<br>
      Network Reliability: ${analysis.reliability}
    `;
  }
}

function getImpactColor(impact) {
  switch(impact) {
    case "LOW": return "green";
    case "MEDIUM": return "orange";
    case "HIGH": return "red";
    case "CRITICAL": return "darkred";
    default: return "gray";
  }
}

// Clear backup visualization
function clearBackup() {
  // Remove backup polylines
  backupPolylines.forEach(p => map.removeLayer(p));
  backupPolylines = [];
  
  // Reset failed edge color
  if (failedEdgePolyline) {
    failedEdgePolyline.setStyle({color: 'blue', weight: 4});
    failedEdgePolyline = null;
  }
  
  // Hide backup results
  document.getElementById("backupResults").style.display = "none";
  document.getElementById("failureAnalysis").style.display = "none";
  
  // Close any open popups
  map.closePopup();
}

// Send to backend & draw MST
function sendNodesAndDrawMST() {
  addingMode = false;
  document.querySelector('button[onclick="enableAddMode()"]').innerText = "➕ Add House";

  const costPerMeter = parseFloat(document.getElementById("costPerMeter").value);
  if (nodes.length < 2 || isNaN(costPerMeter) || costPerMeter <= 0) {
    alert("Please add at least two houses and valid cost per meter (> 0).");
    return;
  }

  // Clear previous MST and backup
  polylines.forEach(p => map.removeLayer(p));
  polylines = [];
  clearBackup();

  const resultsDiv = document.getElementById("results");
  resultsDiv.style.display = "block";
  resultsDiv.innerHTML = "⚙️ Computing MST...";

  fetch('http://127.0.0.1:5000/compute_mst', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      nodes, 
      cost_per_meter: costPerMeter, 
      substations 
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) throw new Error(data.error);
    
    currentMSTData = data;
    
    // Draw MST edges with click handlers
   // Sequentially draw MST edges with delay
data.edges.forEach((edge, idx) => {
  setTimeout(() => {
    const line = L.polyline([edge.start, edge.end], {
      color: 'blue', 
      weight: 4, 
      opacity: 0.8
    }).addTo(map);

    line.on('click', handleEdgeClick(edge, line, idx));
    line.bindPopup(`🔵 MST Edge ${idx + 1}<br>Distance: ${edge.distance.toFixed(2)}m<br>Click to simulate failure`);

    polylines.push(line);
  }, idx * 900); // 300ms delay between each edge
});


    // Draw line to substation
    const substationLine = L.polyline([
      data.substation_connection.house, 
      data.substation_connection.substation
    ], {
      color: 'green', 
      weight: 5, 
      dashArray: '6,6'
    }).addTo(map);
    
    substationLine.bindPopup(`🟢 Substation Connection<br>Distance: ${data.substation_connection.distance.toFixed(2)}m`);
    polylines.push(substationLine);

    resultsDiv.innerHTML = `
      ✅ MST Generated<br>
      🔌 Wiring Length: ${data.total_length.toFixed(2)} m<br>
      💰 Total Cost: ₹${data.total_cost.toFixed(2)}<br>
      📍 Houses: ${nodes.length}<br>
      🔗 MST Edges: ${data.edges.length}<br>
      <small style="color: #666;">Click any blue edge to simulate failure</small>
    `;
  })
  .catch(err => {
    resultsDiv.innerHTML = "❌ Error: " + err.message;
    console.error('MST computation error:', err);
  });
}

// Reset Map
function resetMap() {
  if (!confirm("Reset everything? This will clear all houses, MST, and backup visualizations.")) return;
  
  nodes = [];
  addingMode = false;
  currentMSTData = null;
  
  // Clear markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  
  // Clear polylines
  polylines.forEach(p => map.removeLayer(p));
  polylines = [];
  
  // Clear backup
  clearBackup();
  
  // Reset UI
  document.getElementById("results").innerHTML = "";
  document.getElementById("results").style.display = "none";
  document.getElementById("costPerMeter").value = "";
  document.querySelector('button[onclick="enableAddMode()"]').innerText = "➕ Add House";
  
  map.getContainer().style.cursor = '';
}

// Download results as JSON
function downloadResult() {
  if (!currentMSTData) {
    alert("Please generate MST first.");
    return;
  }
  
  const resultData = {
    ...currentMSTData,
    houses: nodes,
    timestamp: new Date().toISOString(),
    project: "Optimal Electricity Distribution"
  };
  
  const blob = new Blob([JSON.stringify(resultData, null, 2)], {
    type: "application/json"
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `electricity_network_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
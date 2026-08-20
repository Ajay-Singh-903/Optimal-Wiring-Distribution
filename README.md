# ⚡ Optimal Electricity Distribution

An interactive web-based application for designing and visualizing an optimal electricity distribution network using the **Minimum Spanning Tree (MST)** concept.

The application allows users to place houses on an interactive map, specify the cost of electricity wiring per meter, generate an optimized wiring network, connect the network to a nearby substation, simulate wiring failures, and automatically generate a backup network.

---

## 📌 Project Overview

The **Optimal Electricity Distribution** system is designed to minimize the total wiring distance and associated installation cost while connecting multiple houses to an electricity distribution network.

The application combines:

- C++ for MST computation
- Python Flask for backend communication
- HTML, CSS and JavaScript for the frontend
- React for the login interface
- Leaflet.js for interactive map visualization

Users can interact directly with the map to place houses and visualize the generated electricity network.

---

## ✨ Features

### 🏠 Interactive House Placement

- Add houses directly by clicking on the map.
- Houses are displayed using numbered markers.
- House markers can be dragged to change their locations.
- The MST can be regenerated after changing house positions.

### ⚡ Optimal Electricity Distribution

- Calculates an optimized wiring network using the Minimum Spanning Tree concept.
- Displays the selected MST edges on the map.
- Calculates the total wiring length.
- Calculates the total wiring cost based on the user-provided cost per meter.

### 🏭 Substation Connection

- Includes predefined electricity substations.
- Automatically determines a connection between the network and a substation.
- Displays the substation connection separately on the map.

### 🚨 Failure Simulation

Users can click any MST edge to simulate a wiring failure.

The failed connection is:

- Highlighted in red.
- Removed from the active network during failure analysis.
- Analyzed to determine its impact on the network.

### 🔄 Automatic Backup Network

After an edge failure, the application generates a backup network.

The backup network displays:

- Backup wiring connections
- Backup wiring length
- Backup wiring cost
- Additional cost compared to the original network

Backup connections are displayed as purple dashed lines.

### 📊 Failure Impact Analysis

The system analyzes the effect of a failed connection and categorizes the impact as:

- LOW
- MEDIUM
- HIGH
- CRITICAL

It also displays:

- Cost increase percentage
- Original network cost
- Backup network cost
- Network reliability

### 💾 Download Results

Users can download the generated electricity distribution results as a JSON file.

The downloaded file contains:

- MST information
- House locations
- Network details
- Timestamp
- Project information

---

## 🗺️ Map Visualization

The application uses **Leaflet.js** and OpenStreetMap to provide an interactive geographical map.

### Map Legend

| Color | Meaning |
|-------|---------|
| 🔵 Blue | MST Edge |
| 🟢 Green | Substation Connection |
| 🔴 Red | Failed Edge |
| 🟣 Purple | Backup Edge |
| ⚡ | Electricity Substation |
| 🏠 | House |

Users can also hover/click on network edges to view information such as distance and simulate failures.

---

## 🔐 Login

The application includes a login interface before accessing the main application.

### Demo Credentials

```text
Username: admin
Password: 1234
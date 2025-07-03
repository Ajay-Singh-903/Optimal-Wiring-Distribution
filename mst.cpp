#include <iostream>
#include <vector>
#include <cmath>
#include <limits>
#include <set>
#include <algorithm>
#include <unordered_set>
#include <unordered_map>
#include <tuple>
#include "json.hpp"

using json = nlohmann::json;
using namespace std;

struct Point {
    double x, y;
    
    bool operator==(const Point& other) const {
        return abs(x - other.x) < 1e-9 && abs(y - other.y) < 1e-9;
    }
};

struct Edge {
    int u, v;
    double weight;
    Point start, end;
    
    bool operator<(const Edge& other) const {
        return weight < other.weight;
    }
};

                    // Union-Find data structure for Kruskal's algorithm
class UnionFind {
private:
    vector<int> parent, rank;
    
public:
    UnionFind(int n) : parent(n), rank(n, 0) {
        for (int i = 0; i < n; i++) {
            parent[i] = i;
        }
    }
    
    int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]);                    // Path compression
        }
        return parent[x];
    }
    
    bool unite(int x, int y) {
        int px = find(x), py = find(y);
        if (px == py) return false;
        
        // Union by rank
        if (rank[px] < rank[py]) {
            parent[px] = py;
        } else if (rank[px] > rank[py]) {
            parent[py] = px;
        } else {
            parent[py] = px;
            rank[px]++;
        }
        return true;
    }
    
    bool connected(int x, int y) {
        return find(x) == find(y);
    }
};

               // Calculate distance between two points (in meters)
double distance(const Point& a, const Point& b) {
               // Using Haversine formula approximation for short distances
    const double EARTH_RADIUS = 6371000.0; // meters
    double lat1 = a.x * M_PI / 180.0;
    double lat2 = b.x * M_PI / 180.0;
    double dlat = (b.x - a.x) * M_PI / 180.0;
    double dlng = (b.y - a.y) * M_PI / 180.0;
    
    double a_val = sin(dlat/2) * sin(dlat/2) + 
                   cos(lat1) * cos(lat2) * sin(dlng/2) * sin(dlng/2);
    double c = 2 * atan2(sqrt(a_val), sqrt(1-a_val));
    
    return EARTH_RADIUS * c;
}

bool pointsEqual(const Point& a, const Point& b, double epsilon = 1e-9) {
    return abs(a.x - b.x) < epsilon && abs(a.y - b.y) < epsilon;
}

           // Check if edge should be blocked
bool isEdgeBlocked(const Edge& edge, const vector<Point>& houses, 
                   const set<pair<int, int>>& blockedEdges) {
    return blockedEdges.count({edge.u, edge.v}) || 
           blockedEdges.count({edge.v, edge.u});
}

               // Generate all possible edges
vector<Edge> generateAllEdges(const vector<Point>& houses) {
    vector<Edge> edges;
    int n = houses.size();
    
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            Edge edge;
            edge.u = i;
            edge.v = j;
            edge.weight = distance(houses[i], houses[j]);
            edge.start = houses[i];
            edge.end = houses[j];
            edges.push_back(edge);
        }
    }
    
    sort(edges.begin(), edges.end());
    return edges;
}

// Compute MST using Kruskal's algorithm
json computeMST(const vector<Point>& houses, double costPerMeter,
                const set<pair<int, int>>& blockedEdges,
                bool allowPartial = false) {
    int n = houses.size();
    if (n < 2) {
        return json({{"error", "Need at least 2 houses"}});
    }
    
    vector<Edge> allEdges = generateAllEdges(houses);
    vector<Edge> mstEdges;
    UnionFind uf(n);
    double totalLength = 0;
    
    // Apply Kruskal's algorithm
    for (const Edge& edge : allEdges) {
        if (isEdgeBlocked(edge, houses, blockedEdges)) {
            continue;  // Skip blocked edges
        }
        
        if (uf.unite(edge.u, edge.v)) {
            mstEdges.push_back(edge);
            totalLength += edge.weight;
            
            if (mstEdges.size() == n - 1) {
                break;  // MST complete
            }
        }
    }
    
    // Check if MST is complete
    if (!allowPartial && mstEdges.size() < n - 1) {
        return json({{"error", "Edge failure disconnects MST"}});
    }
    
    // Convert to JSON format
    json result;
    json edgesJson = json::array();
    
    for (const Edge& edge : mstEdges) {
        edgesJson.push_back({
            {"start", {edge.start.x, edge.start.y}},
            {"end", {edge.end.x, edge.end.y}},
            {"distance", edge.weight}
        });
    }
    
    result["edges"] = edgesJson;
    result["total_length"] = totalLength;
    result["mst_edges_count"] = mstEdges.size();
    result["expected_edges"] = n - 1;
    
    if (allowPartial && mstEdges.size() < n - 1) {
        result["partial_network"] = true;
        result["disconnected_components"] = n - 1 - mstEdges.size();
    }
    
    return result;
}

// Find closest substation to any house
json findClosestSubstation(const vector<Point>& houses, const json& substations) {
    double minDistance = numeric_limits<double>::infinity();
    Point closestHouse, closestSubstation;
    string substationName;
    
    for (const auto& house : houses) {
        for (const auto& sub : substations) {
            Point subPoint = {sub["lat"], sub["lng"]};
            double dist = distance(house, subPoint);
            
            if (dist < minDistance) {
                minDistance = dist;
                closestHouse = house;
                closestSubstation = subPoint;
                substationName = sub.value("name", "Unknown");
            }
        }
    }
    
    return json({
        {"house", {closestHouse.x, closestHouse.y}},
        {"substation", {closestSubstation.x, closestSubstation.y}},
        {"distance", minDistance},
        {"substation_name", substationName}
    });
}

// Process blocked edges from failure specification
set<pair<int, int>> processBlockedEdges(const vector<Point>& houses, 
                                        const json& input) {
    set<pair<int, int>> blockedEdges;
    
    if (!input.contains("fail_edge") || !input["fail_edge"]) {
        return blockedEdges;
    }
    
    if (!input.contains("fail")) {
        return blockedEdges;
    }
    
    auto fail = input["fail"];
    if (!fail.contains("start") || !fail.contains("end")) {
        return blockedEdges;
    }
    
    Point failStart = {fail["start"][0], fail["start"][1]};
    Point failEnd = {fail["end"][0], fail["end"][1]};
    
    // Find corresponding house indices
    for (int i = 0; i < houses.size(); i++) {
        for (int j = i + 1; j < houses.size(); j++) {
            if ((pointsEqual(houses[i], failStart) && pointsEqual(houses[j], failEnd)) ||
                (pointsEqual(houses[i], failEnd) && pointsEqual(houses[j], failStart))) {
                blockedEdges.insert({i, j});
                blockedEdges.insert({j, i});
            }
        }
    }
    
    return blockedEdges;
}

// Enhanced error handling and validation
json validateInput(const json& input) {
    // Check required fields
    if (!input.contains("nodes") || !input["nodes"].is_array()) {
        return json({{"error", "Missing or invalid 'nodes' field"}});
    }
    
    if (!input.contains("cost_per_meter") || !input["cost_per_meter"].is_number()) {
        return json({{"error", "Missing or invalid 'cost_per_meter' field"}});
    }
    
    if (input["nodes"].size() < 2) {
        return json({{"error", "At least 2 nodes required"}});
    }
    
    if (input["cost_per_meter"].get<double>() <= 0) {
        return json({{"error", "Cost per meter must be positive"}});
    }
    
    // Validate node coordinates
    for (size_t i = 0; i < input["nodes"].size(); i++) {
        const auto& node = input["nodes"][i];
        if (!node.is_array() || node.size() != 2) {
            return json({{"error", "Node " + to_string(i) + " must be [lat, lng] array"}});
        }
        
        if (!node[0].is_number() || !node[1].is_number()) {
            return json({{"error", "Node " + to_string(i) + " coordinates must be numbers"}});
        }
        
        double lat = node[0].get<double>();
        double lng = node[1].get<double>();
        
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return json({{"error", "Node " + to_string(i) + " has invalid coordinates"}});
        }
    }
    
    return json(); // No errors
}

int main() {
    try {
        json input;
        cin >> input;
        
        // Validate input
        json validation = validateInput(input);
        if (!validation.is_null()) {
            cout << validation.dump(4) << endl;
            return 1;
        }
        
        // Parse houses
        vector<Point> houses;
        for (const auto& node : input["nodes"]) {
            houses.push_back({node[0], node[1]});
        }
        
        double costPerMeter = input["cost_per_meter"];
        json substations = input.value("substations", json::array());
        
        // Process blocked edges for failure simulation
        set<pair<int, int>> blockedEdges = processBlockedEdges(houses, input);
        
        // Compute MST
        bool isFailureMode = input.contains("fail_edge") && input["fail_edge"];
        json mstResult = computeMST(houses, costPerMeter, blockedEdges, isFailureMode);
        
        if (mstResult.contains("error")) {
            cout << mstResult.dump(4) << endl;
            return 0;
        }
        // Find closest substation
        json substationConnection;
        if (!substations.empty()) {
            substationConnection = findClosestSubstation(houses, substations);
        } 
        
        // Calculate total cost
        double totalLength = mstResult["total_length"].get<double>() + 
                           substationConnection["distance"].get<double>();
        double totalCost = totalLength * costPerMeter;
        
        // Build final result
        json result;
        result["edges"] = mstResult["edges"];
        result["total_length"] = totalLength;
        result["total_cost"] = totalCost;
        result["substation_connection"] = substationConnection;
        result["mst_length"] = mstResult["total_length"];
        result["substation_distance"] = substationConnection["distance"];
        result["houses_count"] = houses.size();
        result["algorithm"] = "Kruskal";
        
        // Add failure simulation info if applicable
        if (isFailureMode) {
            result["failure_mode"] = true;
            result["blocked_edges_count"] = blockedEdges.size() / 2; // Divided by 2 because we store both directions
            
            if (mstResult.contains("partial_network")) {
                result["partial_network"] = mstResult["partial_network"];
                result["disconnected_components"] = mstResult["disconnected_components"];
            }
        }
        
        // Add performance metrics
        result["edges_evaluated"] = (houses.size() * (houses.size() - 1)) / 2;
        result["mst_edges"] = mstResult["mst_edges_count"];
        result["efficiency"] = (double)mstResult["mst_edges_count"].get<int>() / 
                              (double)((houses.size() * (houses.size() - 1)) / 2) * 100.0;
        
        cout << result.dump(4) << endl;
        return 0;
        
    } catch (const json::exception& e) {
        json error = {{"error", "JSON parsing error: " + string(e.what())}};
        cout << error.dump(4) << endl;
        return 1;
    } catch (const exception& e) {
        json error = {{"error", "Computation error: " + string(e.what())}};
        cout << error.dump(4) << endl;
        return 1;
    } catch (...) {
        json error = {{"error", "Unknown error occurred"}};
        cout << error.dump(4) << endl;
        return 1;
    }
}
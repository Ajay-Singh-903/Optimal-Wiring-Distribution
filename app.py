from flask import Flask, request, jsonify
import subprocess
import json
import time
import logging
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Thread pool for concurrent processing
EXECUTOR = ThreadPoolExecutor(max_workers=4)

def validate_mst_input(f):
    """Decorator to validate MST computation inputs"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            data = request.get_json()
            
            # Validate required fields
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400
            
            if 'nodes' not in data or not isinstance(data['nodes'], list):
                return jsonify({"error": "Missing or invalid 'nodes' field"}), 400
            
            if len(data['nodes']) < 2:
                return jsonify({"error": "At least 2 nodes required"}), 400
            
            if 'cost_per_meter' not in data:
                return jsonify({"error": "Missing 'cost_per_meter' field"}), 400
            
            try:
                cost = float(data['cost_per_meter'])
                if cost <= 0:
                    return jsonify({"error": "Cost per meter must be positive"}), 400
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid cost_per_meter value"}), 400
            
            # Validate node coordinates
            for i, node in enumerate(data['nodes']):
                if not isinstance(node, list) or len(node) != 2:
                    return jsonify({"error": f"Node {i} must be [lat, lng] array"}), 400
                
                try:
                    lat, lng = float(node[0]), float(node[1])
                    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                        return jsonify({"error": f"Node {i} has invalid coordinates"}), 400
                except (ValueError, TypeError):
                    return jsonify({"error": f"Node {i} coordinates must be numbers"}), 400
            
            # Validate substations if provided
            if 'substations' in data and data['substations']:
                if not isinstance(data['substations'], list):
                    return jsonify({"error": "Substations must be an array"}), 400
                
                for i, sub in enumerate(data['substations']):
                    if not isinstance(sub, dict) or 'lat' not in sub or 'lng' not in sub:
                        return jsonify({"error": f"Substation {i} missing lat/lng"}), 400
            
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Input validation error: {str(e)}")
            return jsonify({"error": "Input validation failed"}), 400
    
    return wrapper

def run_mst_computation(input_data):
    """Run MST computation with timeout and error handling"""
    try:
        start_time = time.time()
        
        # Run C++ MST program
        process = subprocess.run(
            ['./mst'],
            input=json.dumps(input_data).encode('utf-8'),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,  # 30 second timeout
            check=False
        )
        
        computation_time = time.time() - start_time
        logger.info(f"MST computation took {computation_time:.2f} seconds")
        
        # Check for process errors
        if process.returncode != 0:
            error_msg = process.stderr.decode('utf-8').strip()
            logger.error(f"MST computation failed: {error_msg}")
            return {"error": f"Computation failed: {error_msg}"}
        
        # Parse output
        try:
            output = process.stdout.decode('utf-8').strip()
            if not output:
                return {"error": "No output from MST computation"}
            
            result = json.loads(output)
            result['computation_time'] = computation_time
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            logger.error(f"Raw output: {process.stdout.decode('utf-8')}")
            return {"error": "Invalid JSON output from computation"}
    
    except subprocess.TimeoutExpired:
        logger.error("MST computation timeout")
        return {"error": "Computation timeout - network too large"}
    
    except FileNotFoundError:
        logger.error("MST executable not found")
        return {"error": "MST computation service unavailable"}
    
    except Exception as e:
        logger.error(f"Unexpected error in MST computation: {str(e)}")
        return {"error": "Internal computation error"}

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Test if MST executable exists and is working
        test_data = {
            "nodes": [[0, 0], [1, 1]],
            "cost_per_meter": 5.0,
            "substations": [{"name": "Test", "lat": 0.5, "lng": 0.5}]
        }
        
        result = run_mst_computation(test_data)
        
        if "error" in result:
            return jsonify({
                "status": "unhealthy",
                "error": "MST computation test failed",
                "timestamp": time.time()
            }), 503
        
        return jsonify({
            "status": "healthy",
            "version": "1.0",
            "timestamp": time.time()
        })
    
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }), 503

@app.route('/compute_mst', methods=['POST'])
@validate_mst_input
def compute_mst():
    """Compute minimum spanning tree for electricity distribution"""
    try:
        input_data = request.get_json()
        logger.info(f"Computing MST for {len(input_data['nodes'])} nodes")
        
        # Submit computation to thread pool
        future = EXECUTOR.submit(run_mst_computation, input_data)
        result = future.result()
        
        if "error" in result:
            logger.warning(f"MST computation error: {result['error']}")
            return jsonify(result), 400
        
        logger.info(f"MST computation successful - Cost: ₹{result.get('total_cost', 0):.2f}")
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"MST endpoint error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/simulate_failure', methods=['POST'])
@validate_mst_input
def simulate_failure():
    """Simulate edge failure and compute backup MST"""
    try:
        input_data = request.get_json()
        
        # Validate failure edge data
        if 'fail' not in input_data:
            return jsonify({"error": "Missing 'fail' field for edge failure simulation"}), 400
        
        fail_data = input_data['fail']
        if not isinstance(fail_data, dict) or 'start' not in fail_data or 'end' not in fail_data:
            return jsonify({"error": "Invalid fail edge format - need start and end coordinates"}), 400
        
        # Validate fail edge coordinates
        try:
            start_coords = fail_data['start']
            end_coords = fail_data['end']
            
            if not (isinstance(start_coords, list) and len(start_coords) == 2 and
                    isinstance(end_coords, list) and len(end_coords) == 2):
                return jsonify({"error": "Fail edge coordinates must be [lat, lng] arrays"}), 400
            
            # Convert to floats to validate
            float(start_coords[0]), float(start_coords[1])
            float(end_coords[0]), float(end_coords[1])
            
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid fail edge coordinate values"}), 400
        
        logger.info(f"Simulating failure for edge: {fail_data['start']} -> {fail_data['end']}")
        
        # Add failure flag
        input_data['fail_edge'] = True
        
        # Submit computation to thread pool
        future = EXECUTOR.submit(run_mst_computation, input_data)
        result = future.result()
        
        if "error" in result:
            logger.warning(f"Failure simulation error: {result['error']}")
            
            # Check if it's a critical failure (network disconnected)
            if "disconnected" in result['error'].lower() or "invalid edge" in result['error'].lower():
                return jsonify({
                    "error": "Critical failure - Network becomes disconnected",
                    "impact": "CRITICAL",
                    "details": result['error']
                }), 200  # Return 200 with error info for frontend handling
            
            return jsonify(result), 400
        
        logger.info(f"Failure simulation successful - Backup cost: ₹{result.get('total_cost', 0):.2f}")
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Failure simulation endpoint error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/network_analysis', methods=['POST'])
@validate_mst_input
def network_analysis():
    """Comprehensive network resilience analysis"""
    try:
        input_data = request.get_json()
        nodes = input_data['nodes']
        
        if len(nodes) < 3:
            return jsonify({"error": "Need at least 3 nodes for network analysis"}), 400
        
        logger.info(f"Running network analysis for {len(nodes)} nodes")
        
        # Compute original MST
        original_future = EXECUTOR.submit(run_mst_computation, input_data.copy())
        original_result = original_future.result()
        
        if "error" in original_result:
            return jsonify({"error": f"Original MST computation failed: {original_result['error']}"}), 400
        
        # Analyze each edge failure
        analysis_results = []
        
        for i, edge in enumerate(original_result.get('edges', [])):
            failure_data = input_data.copy()
            failure_data['fail_edge'] = True
            failure_data['fail'] = {
                'start': edge['start'],
                'end': edge['end']
            }
            
            failure_future = EXECUTOR.submit(run_mst_computation, failure_data)
            failure_result = failure_future.result()
            
            edge_analysis = {
                'edge_index': i,
                'edge': edge,
                'critical': "error" in failure_result,
                'cost_impact': 0,
                'impact_level': 'NONE'
            }
            
            if "error" not in failure_result:
                cost_increase = failure_result['total_cost'] - original_result['total_cost']
                cost_increase_percent = (cost_increase / original_result['total_cost']) * 100
                
                edge_analysis.update({
                    'backup_cost': failure_result['total_cost'],
                    'cost_impact': cost_increase,
                    'cost_impact_percent': cost_increase_percent,
                    'impact_level': 'HIGH' if cost_increase_percent > 50 else 
                                   'MEDIUM' if cost_increase_percent > 20 else 'LOW'
                })
            else:
                edge_analysis['impact_level'] = 'CRITICAL'
            
            analysis_results.append(edge_analysis)
        
        # Calculate overall network metrics
        critical_edges = [r for r in analysis_results if r['critical']]
        high_impact_edges = [r for r in analysis_results if r['impact_level'] == 'HIGH']
        
        network_metrics = {
            'total_edges': len(analysis_results),
            'critical_edges': len(critical_edges),
            'high_impact_edges': len(high_impact_edges),
            'reliability_score': max(0, 100 - (len(critical_edges) * 30) - (len(high_impact_edges) * 10)),
            'resilience_level': 'HIGH' if len(critical_edges) == 0 and len(high_impact_edges) <= 1 else
                               'MEDIUM' if len(critical_edges) <= 1 else 'LOW'
        }
        
        logger.info(f"Network analysis complete - Reliability score: {network_metrics['reliability_score']}")
        
        return jsonify({
            'original_network': original_result,
            'edge_analysis': analysis_results,
            'network_metrics': network_metrics,
            'timestamp': time.time()
        })
    
    except Exception as e:
        logger.error(f"Network analysis error: {str(e)}")
        return jsonify({"error": "Network analysis failed"}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    logger.info("Starting Optimal Electricity Distribution API server")
    logger.info("Available endpoints:")
    logger.info("  GET  /health - Health check")
    logger.info("  POST /compute_mst - Compute minimum spanning tree")
    logger.info("  POST /simulate_failure - Simulate edge failure")
    logger.info("  POST /network_analysis - Comprehensive network analysis")
    
    app.run(host='127.0.0.1', port=5000, debug=True)
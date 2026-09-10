import requests
import threading
import time
import argparse
import statistics
from concurrent.futures import ThreadPoolExecutor

def stress_test_endpoint(url, num_requests):
    success_count = 0
    latencies = []
    
    for _ in range(num_requests):
        start_time = time.time()
        try:
            response = requests.get(url, timeout=5)
            latency = time.time() - start_time
            latencies.append(latency)
            if response.status_code == 200:
                success_count += 1
        except Exception as e:
            print(f"Error: {e}")
            
    return success_count, latencies

def run_stress_test(base_url, num_users, requests_per_user):
    endpoints = [
        f"{base_url}/health",
        f"{base_url}/stocks",
        f"{base_url}/indexes"
    ]
    
    print(f"Starting stress test on {base_url}")
    print(f"Users: {num_users}, Requests per user: {requests_per_user}")
    
    total_start = time.time()
    all_latencies = []
    total_success = 0
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = []
        for i in range(num_users):
            # Rotate through endpoints
            endpoint = endpoints[i % len(endpoints)]
            futures.append(executor.submit(stress_test_endpoint, endpoint, requests_per_user))
            
        for future in futures:
            successes, latencies = future.result()
            total_success += successes
            all_latencies.extend(latencies)
            
    total_duration = time.time() - total_start
    total_requests = num_users * requests_per_user
    
    print("\n--- Stress Test Results ---")
    print(f"Total Requests: {total_requests}")
    print(f"Successful: {total_success} ({total_success/total_requests*100:.2f}%)")
    print(f"Total Duration: {total_duration:.2f}s")
    print(f"Requests Per Second: {total_requests/total_duration:.2f}")
    
    if all_latencies:
        print(f"Min Latency: {min(all_latencies)*1000:.2f}ms")
        print(f"Max Latency: {max(all_latencies)*1000:.2f}ms")
        print(f"Avg Latency: {statistics.mean(all_latencies)*1000:.2f}ms")
        if len(all_latencies) > 1:
            print(f"P95 Latency: {statistics.quantiles(all_latencies, n=20)[18]*1000:.2f}ms")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Invexa Stress Tester")
    parser.add_argument("--url", default="http://localhost:3000", help="Base URL of the backend")
    parser.add_argument("--users", type=int, default=5, help="Number of concurrent users")
    parser.add_argument("--requests", type=int, default=20, help="Requests per user")
    
    args = parser.parse_args()
    run_stress_test(args.url, args.users, args.requests)

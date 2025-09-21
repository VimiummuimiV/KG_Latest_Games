import requests
import time
import signal
import sys
import os
import threading
import queue
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

class StatusChecker:
    def __init__(self, base_url, num_threads=20):
        self.base_url = base_url
        self.found_vocab_ids = []
        self.running = True
        self.successful_requests = 0
        self.num_threads = num_threads
        self.current_id = 1
        self.id_lock = threading.Lock()
        self.results_lock = threading.Lock()
        self.pending_results = {}  # Store results that arrive out of order
        self.next_to_print = 1
        
    def signal_handler(self, sig, frame):
        """Handle Ctrl+C gracefully and save log to file"""
        self.running = False
        print(f"\n\nScript cancelled.")
        print(f"Successful requests: {self.successful_requests}")
        print(f"Saving {len(self.found_vocab_ids)} found vocabularies to desktop...")
        self.save_log()
        print(f"Log saved successfully!")
        sys.exit(0)
    
    def save_log(self):
        """Save all logged numbers to desktop"""
        try:
            desktop_paths = [
                os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop'),
                os.path.join(os.environ.get('HOMEDRIVE', 'C:'), os.environ.get('HOMEPATH', ''), 'Desktop'),
                os.path.join(os.path.expanduser("~"), "Desktop"),
            ]
            
            desktop_path = None
            for path in desktop_paths:
                if os.path.exists(path):
                    desktop_path = path
                    break
            
            if not desktop_path:
                desktop_path = os.getcwd()
            
            log_file_path = os.path.join(desktop_path, "valid_vocabularies.txt")
            
            with open(log_file_path, 'w', encoding='utf-8') as f:
                f.write(f"Status Check Log - Created: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"Base URL: {self.base_url}\n")
                f.write(f"Successful requests: {self.successful_requests}\n")
                f.write(f"Threads used: {self.num_threads}\n")
                f.write("-" * 50 + "\n")
                
                f.write("FOUND VOCABULARIES:\n")
                for vocab_id in self.found_vocab_ids:
                    f.write(f"{vocab_id}\n")
            
        except Exception as e:
            print(f"Error saving log: {e}")

    def get_next_id(self):
        """Get next vocabulary ID to check"""
        with self.id_lock:
            if self.running:
                vocab_id = self.current_id
                self.current_id += 1
                return vocab_id
            return None

    def process_result(self, vocab_id, status):
        """Process result and print in order"""
        with self.results_lock:
            # Store the result
            self.pending_results[vocab_id] = status
            
            # Print all consecutive results starting from next_to_print
            while self.next_to_print in self.pending_results and self.running:
                current_id = self.next_to_print
                current_status = self.pending_results[current_id]
                
                if current_status == 200:
                    self.successful_requests += 1
                    self.found_vocab_ids.append(current_id)
                    print(f"{current_id}")
                elif current_status in [404, 403]:
                    # Only print "absent", don't store in any list
                    print(f"absent {current_id}")
                
                # Clean up and move to next
                del self.pending_results[current_id]
                self.next_to_print += 1

    def worker_thread(self):
        """Worker thread function"""
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        while self.running:
            vocab_id = self.get_next_id()
            if vocab_id is None:
                break
                
            try:
                url = f"{self.base_url}{vocab_id}"
                response = session.get(url, timeout=2)
                self.process_result(vocab_id, response.status_code)
                
            except Exception:
                # Treat network errors as "not found" or skip
                self.process_result(vocab_id, 404)

    def run(self):
        """Main function using multithreading with ordered output"""
        signal.signal(signal.SIGINT, self.signal_handler)
        
        print(f"Starting {self.num_threads} threads for sequential vocabulary checking")
        print("Press Ctrl+C to stop and save log to desktop")
        print("-" * 50)
        
        try:
            with ThreadPoolExecutor(max_workers=self.num_threads) as executor:
                # Start worker threads
                futures = [executor.submit(self.worker_thread) for _ in range(self.num_threads)]
                
                # Keep main thread alive
                while self.running:
                    time.sleep(0.1)
                    
        except KeyboardInterrupt:
            self.signal_handler(signal.SIGINT, None)

if __name__ == "__main__":
    BASE_URL = "https://klavogonki.ru/vocs/"
    NUM_THREADS = 10  # Reduced threads to make ordering easier
    
    checker = StatusChecker(BASE_URL, NUM_THREADS)
    checker.run()
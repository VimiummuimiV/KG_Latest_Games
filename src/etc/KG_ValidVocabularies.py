import requests
import time
import signal
import sys
import os
import threading
import queue
import json
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Selenium imports (Firefox)
from selenium import webdriver
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from webdriver_manager.firefox import GeckoDriverManager

# For reading single keypresses
try:
    import msvcrt  # Windows
    WINDOWS = True
except ImportError: # Unix/Linux/Mac
    import tty
    import termios
    WINDOWS = False


class StatusChecker:
    def __init__(self, base_url, start_id=1, num_threads=20):
        self.base_url = base_url
        self.found_vocabularies = {
            "words": [],
            "phrases": [],
            "texts": [],
            "url": [],
            "books": [],
            "generator": []
        }
        self.running = True
        self.successful_requests = 0
        self.num_threads = num_threads
        self.current_id = start_id
        self.start_id = start_id
        self.id_lock = threading.Lock()
        self.results_lock = threading.Lock()
        self.pending_results = {}
        self.next_to_print = start_id

        # Moderation queue
        self.moderation_queue = queue.Queue()
        self.moderation_thread = threading.Thread(target=self.moderate_results, daemon=True)
        
        # Event to pause/resume workers during moderation
        self.workers_paused = threading.Event()
        self.workers_paused.set()  # Start with workers running
        
        # Track if currently moderating to prevent duplicates
        self.currently_moderating = False

    def signal_handler(self, sig, frame):
        """Handle Ctrl+C gracefully and save log to file"""
        self.running = False
        print(f"\n\nScript cancelled.")
        print(f"Successful requests: {self.successful_requests}")
        print(f"Saving found vocabularies to desktop...")
        self.save_log()
        print(f"Log saved successfully!")
        sys.exit(0)

    def get_vocab_type_english(self, russian_type):
        """Convert Russian vocabulary type to English key"""
        type_mapping = {
            "Слова": "words",
            "Фразы": "phrases",
            "Тексты": "texts",
            "URL": "url",
            "Книга": "books",
            "Генератор": "generator"
        }
        return type_mapping.get(russian_type, "unknown")

    def save_log(self):
        """Save all logged vocabularies to desktop as JSON"""
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

            output_data = {
                "validVocabularies": self.found_vocabularies
            }

            with open(log_file_path, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

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
            self.pending_results[vocab_id] = status

            while self.next_to_print in self.pending_results and self.running and not self.currently_moderating:
                current_id = self.next_to_print
                current_status = self.pending_results[current_id]

                if current_status == 200:
                    url = f"{self.base_url}{current_id}"
                    # Mark as moderating and pause workers
                    self.currently_moderating = True
                    self.workers_paused.clear()
                    self.moderation_queue.put((current_id, url))
                    print(f"moderation needed {current_id} - WORKERS PAUSED")
                    # Break and wait for moderation to complete
                    break
                elif current_status in [404, 403]:
                    print(f"absent {current_id}")
                    del self.pending_results[current_id]
                    self.next_to_print += 1

    def worker_thread(self):
        """Worker thread function"""
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/91.0.4472.124 Safari/537.36'
        })

        while self.running:
            # Wait if workers are paused
            self.workers_paused.wait()
            
            if not self.running:
                break
                
            vocab_id = self.get_next_id()
            if vocab_id is None:
                break

            try:
                url = f"{self.base_url}{vocab_id}"
                response = session.get(url, timeout=2)
                self.process_result(vocab_id, response.status_code)

            except Exception:
                self.process_result(vocab_id, 404)

    def get_single_keypress(self):
        """Read a single keypress without requiring Enter"""
        if WINDOWS:
            # Windows
            return msvcrt.getch().decode('utf-8', errors='ignore').lower()
        else:
            # Unix/Linux/Mac
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            try:
                tty.setraw(sys.stdin.fileno())
                ch = sys.stdin.read(1)
                return ch.lower()
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

    def check_if_public(self, driver):
        """Parse the page to check if vocabulary is public (Публичный: Да)"""
        try:
            # Find all <dt> elements
            dt_elements = driver.find_elements(By.TAG_NAME, "dt")
            
            for dt in dt_elements:
                dt_text = dt.text.strip().replace('\n', '').replace('\t', '')
                if "Публичный:" in dt_text or "Публичный" in dt_text:
                    # Get the next sibling <dd> element
                    dd = dt.find_element(By.XPATH, "following-sibling::dd[1]")
                    value = dd.text.strip().split('\n')[0].strip()
                    
                    if value == "Да":
                        return True
                    elif value == "Нет":
                        return False
            
            # If we can't find the field, assume it's public
            return True
            
        except Exception as e:
            print(f"Error parsing public status: {e}")
            # On error, assume public to allow manual moderation
            return True

    def get_vocab_type(self, driver):
        """Extract vocabulary type from the page"""
        try:
            dt_elements = driver.find_elements(By.TAG_NAME, "dt")
            
            for dt in dt_elements:
                dt_text = dt.text.strip().replace('\n', '').replace('\t', '')
                if "Тип словаря:" in dt_text or "Тип словаря" in dt_text:
                    dd = dt.find_element(By.XPATH, "following-sibling::dd[1]")
                    # Get only the first line, ignore the note div
                    dd_text = dd.text.strip().split('\n')[0].strip()
                    russian_type = dd_text
                    return self.get_vocab_type_english(russian_type)
            
            return "unknown"
            
        except Exception as e:
            print(f"Error parsing vocabulary type: {e}")
            return "unknown"

    def moderate_results(self):
        """Run Selenium moderation loop with Firefox"""
        options = Options()
        options.add_argument("--width=1200")
        options.add_argument("--height=800")

        # Uncomment if you want no browser window:
        # options.add_argument("--headless")

        driver = webdriver.Firefox(
            service=Service(GeckoDriverManager().install()),
            options=options
        )

        while self.running:
            try:
                vocab_id, url = self.moderation_queue.get(timeout=1)
            except queue.Empty:
                continue

            try:
                driver.get(url)
                
                # Wait a moment for page to load
                time.sleep(0.5)
                
                # Check if vocabulary is public
                is_public = self.check_if_public(driver)
                
                if not is_public:
                    print(f"not public {vocab_id}")
                    
                    # Resume processing after auto-skip
                    with self.results_lock:
                        if vocab_id in self.pending_results:
                            del self.pending_results[vocab_id]
                        self.next_to_print += 1
                        self.currently_moderating = False
                    
                    self.workers_paused.set()  # Resume workers
                    print("WORKERS RESUMED\n")
                    
                    # Trigger processing of any pending results
                    self.process_pending_results()
                    continue
                
                # Get vocabulary type
                vocab_type = self.get_vocab_type(driver)
                
                # If public, show for manual moderation
                print(f"\n{'='*60}")
                print(f"Moderating {vocab_id} → {url}")
                print(f"Type: {vocab_type}")
                print(f"{'='*60}")
                print("Press [SPACE] to approve, [s] to skip, [q] to quit:")

                while True:
                    choice = self.get_single_keypress()
                    
                    if choice == 'q':
                        print("\nq - Exiting...")
                        self.running = False
                        driver.quit()
                        self.save_log()
                        print(f"Successful requests: {self.successful_requests}")
                        print(f"Log saved to desktop!")
                        sys.exit(0)
                    elif choice == ' ':
                        self.successful_requests += 1
                        if vocab_type in self.found_vocabularies:
                            self.found_vocabularies[vocab_type].append(vocab_id)
                        else:
                            self.found_vocabularies["unknown"] = self.found_vocabularies.get("unknown", [])
                            self.found_vocabularies["unknown"].append(vocab_id)
                        print(f"SPACE - ➕ Approved {vocab_id} ({vocab_type})")
                        
                        # Resume processing after moderation
                        with self.results_lock:
                            if vocab_id in self.pending_results:
                                del self.pending_results[vocab_id]
                            self.next_to_print += 1
                            self.currently_moderating = False
                        
                        self.workers_paused.set()  # Resume workers
                        print("WORKERS RESUMED\n")
                        
                        # Trigger processing of any pending results
                        self.process_pending_results()
                        break
                    elif choice == 's':
                        print(f"s - ❌ Skipped {vocab_id}")
                        
                        # Resume processing after moderation
                        with self.results_lock:
                            if vocab_id in self.pending_results:
                                del self.pending_results[vocab_id]
                            self.next_to_print += 1
                            self.currently_moderating = False
                        
                        self.workers_paused.set()  # Resume workers
                        print("WORKERS RESUMED\n")
                        
                        # Trigger processing of any pending results
                        self.process_pending_results()
                        break
                        
            except Exception as e:
                print(f"Error moderating {vocab_id}: {e}")
                # Resume workers even on error
                with self.results_lock:
                    if vocab_id in self.pending_results:
                        del self.pending_results[vocab_id]
                    self.next_to_print += 1
                    self.currently_moderating = False
                self.workers_paused.set()
                self.process_pending_results()

        driver.quit()

    def process_pending_results(self):
        """Process any pending results after moderation completes"""
        with self.results_lock:
            while self.next_to_print in self.pending_results and self.running and not self.currently_moderating:
                current_id = self.next_to_print
                current_status = self.pending_results[current_id]

                if current_status == 200:
                    url = f"{self.base_url}{current_id}"
                    self.currently_moderating = True
                    self.workers_paused.clear()
                    self.moderation_queue.put((current_id, url))
                    print(f"moderation needed {current_id} - WORKERS PAUSED")
                    break
                elif current_status in [404, 403]:
                    print(f"absent {current_id}")
                    del self.pending_results[current_id]
                    self.next_to_print += 1

    def run(self):
        """Main function using multithreading with ordered output"""
        signal.signal(signal.SIGINT, self.signal_handler)

        print(f"Starting {self.num_threads} threads for sequential vocabulary checking")
        print(f"Starting from ID: {self.start_id}")
        print("Press Ctrl+C to stop and save log to desktop")
        print("-" * 50)

        # Start moderation thread
        self.moderation_thread.start()

        try:
            with ThreadPoolExecutor(max_workers=self.num_threads) as executor:
                futures = [executor.submit(self.worker_thread) for _ in range(self.num_threads)]
                while self.running:
                    time.sleep(0.1)

        except KeyboardInterrupt:
            self.signal_handler(signal.SIGINT, None)


def find_max_id_from_file(file_path):
    """Find the maximum ID from existing JSON file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        max_id = 0
        valid_vocabs = data.get("validVocabularies", {})
        
        for vocab_type, ids in valid_vocabs.items():
            if ids and len(ids) > 0:
                max_id = max(max_id, max(ids))
        
        return max_id
    except Exception as e:
        print(f"Error reading file: {e}")
        return None


def get_start_id():
    """Ask user for starting ID with validation and file checking"""
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

    json_file_path = None
    if desktop_path:
        json_file_path = os.path.join(desktop_path, "valid_vocabularies.txt")

    # Check if file exists and get suggested ID
    suggested_id = None
    if json_file_path and os.path.exists(json_file_path):
        max_id = find_max_id_from_file(json_file_path)
        if max_id and max_id > 0:
            suggested_id = max_id + 1
            print(f"Found existing file with max ID: {max_id}")
            print(f"Suggested starting ID: {suggested_id}")

    # Set default based on whether we have a suggestion
    default_id = suggested_id if suggested_id is not None else 1
    prompt = f"Enter starting vocabulary ID (press Enter for {default_id}): "

    while True:
        try:
            user_input = input(prompt).strip()

            if user_input == "":
                return default_id

            start_id = int(user_input)

            if start_id < 1:
                print("Please enter a positive number (1 or greater).")
                continue

            return start_id

        except ValueError:
            print("Please enter a valid number.")
        except KeyboardInterrupt:
            print("\nExiting...")
            sys.exit(0)


if __name__ == "__main__":
    BASE_URL = "https://klavogonki.ru/vocs/"
    NUM_THREADS = 10

    start_id = get_start_id()
    checker = StatusChecker(BASE_URL, start_id, NUM_THREADS)
    checker.run()
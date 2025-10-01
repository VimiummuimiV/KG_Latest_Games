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
import pyperclip

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


class DirectoryManager:
    """Manages persistent directory configuration"""
    def __init__(self):
        self.config_file = os.path.join(os.path.expanduser("~"), ".vocab_checker_config.json")
        self.default_desktop_paths = [
            os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop'),
            os.path.join(os.environ.get('HOMEDRIVE', 'C:'), os.environ.get('HOMEPATH', ''), 'Desktop'),
            os.path.join(os.path.expanduser("~"), "Desktop"),
        ]
    
    def get_default_desktop(self):
        """Find the default desktop path"""
        for path in self.default_desktop_paths:
            if os.path.exists(path):
                return path
        return os.getcwd()
    
    def load_saved_directory(self):
        """Load the last used directory from config file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    saved_dir = config.get('last_directory')
                    if saved_dir and os.path.exists(saved_dir):
                        return saved_dir
        except Exception as e:
            print(f"Could not load saved directory: {e}")
        return None
    
    def save_directory(self, directory):
        """Save the current directory to config file"""
        try:
            config = {'last_directory': directory}
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Could not save directory preference: {e}")
    
    def get_working_directory(self):
        """Get the working directory (saved or default)"""
        saved_dir = self.load_saved_directory()
        if saved_dir:
            print(f"Using saved directory: {saved_dir}")
            return saved_dir
        else:
            default_dir = self.get_default_desktop()
            print(f"Using default directory: {default_dir}")
            return default_dir
    
    def prompt_for_directory(self):
        """Prompt user to confirm or change directory"""
        current_dir = self.get_working_directory()
        print(f"\nCurrent working directory: {current_dir}")
        print("Press [Enter] to use this directory, or [c] to change it:")
        
        if WINDOWS:
            choice = msvcrt.getch().decode('utf-8', errors='ignore').lower()
        else:
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            try:
                tty.setraw(sys.stdin.fileno())
                choice = sys.stdin.read(1).lower()
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        
        print()  # New line after keypress
        
        if choice == 'c':
            print("\nEnter new directory path (or press Enter to cancel):")
            new_dir = input().strip()
            if new_dir and os.path.exists(new_dir):
                self.save_directory(new_dir)
                print(f"Directory saved: {new_dir}")
                return new_dir
            elif new_dir:
                print(f"Directory does not exist: {new_dir}")
                print(f"Using current directory: {current_dir}")
        
        return current_dir


class StatusChecker:
    def __init__(self, base_url, start_id=1, num_threads=20, working_directory=None):
        self.base_url = base_url
        self.found_vocabularies = {
            "words": [],
            "phrases": [],
            "texts": [],
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
        
        # Set working directory
        self.working_directory = working_directory or os.getcwd()

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
        print(f"Saving found vocabularies to {self.working_directory}...")
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

    def format_id_as_bbcode(self, vocab_id):
        """Format a single ID as BBCode link"""
        return f'[url="{self.base_url}{vocab_id}/"]{vocab_id}[/url]'

    def save_log(self):
        """Save all logged vocabularies to working directory as JSON, preserving previous data"""
        try:
            log_file_path = os.path.join(self.working_directory, "valid_vocabularies.txt")

            # Load existing data if file exists
            existing_data = {"validVocabularies": {}}
            if os.path.exists(log_file_path):
                try:
                    with open(log_file_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                        print(f"Loaded existing data from file")
                except Exception as e:
                    print(f"Could not load existing data: {e}")
                    existing_data = {"validVocabularies": {}}

            # Merge new data with existing data
            merged_vocabularies = existing_data.get("validVocabularies", {})
            
            # Track stats for clipboard
            clipboard_lines = []
            
            for vocab_type, new_ids in self.found_vocabularies.items():
                if new_ids:  # Only process if there are new IDs
                    # Get existing IDs for this type
                    existing_ids = merged_vocabularies.get(vocab_type, [])
                    
                    # Combine and remove duplicates, then sort
                    combined_ids = list(set(existing_ids + new_ids))
                    combined_ids.sort()
                    
                    merged_vocabularies[vocab_type] = combined_ids
                    
                    print(f"Type '{vocab_type}': {len(existing_ids)} existing + {len(new_ids)} new = {len(combined_ids)} total")
                    
                    # Build clipboard summary with BBCode formatted IDs
                    sorted_new_ids = sorted(new_ids)
                    bbcode_ids = [self.format_id_as_bbcode(vid) for vid in sorted_new_ids]
                    new_ids_str = ', '.join(bbcode_ids)
                    
                    clipboard_lines.append(f"Type '{vocab_type}': {len(existing_ids)} existing + {len(new_ids)} new = {len(combined_ids)} total")
                    clipboard_lines.append(f"New IDs: {new_ids_str}")
                    clipboard_lines.append("")  # Empty line
                    
                    print(f"  New IDs: {new_ids_str}")
                    print()  # Empty line after each type

            output_data = {
                "validVocabularies": merged_vocabularies
            }

            # Save merged data
            with open(log_file_path, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

            # Copy to clipboard
            if clipboard_lines:
                clipboard_text = '\n'.join(clipboard_lines)
                try:
                    pyperclip.copy(clipboard_text)
                    print("📋 Summary copied to clipboard (BBCode format)!")
                except Exception as e:
                    print(f"Could not copy to clipboard: {e}")

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
                
                # Auto-skip URL type vocabularies
                if vocab_type == "url":
                    print(f"skipped {vocab_id}: url")
                    
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
                
                # If public and not URL type, show for manual moderation
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
                        print(f"Log saved to {self.working_directory}!")
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
                        print(f"s - ❌ Skipped {vocab_id}: {vocab_type}")
                        
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
        print(f"Working directory: {self.working_directory}")
        print("Press Ctrl+C to stop and save log")
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


def get_start_id(working_directory):
    """Ask user for starting ID with validation and file checking"""
    json_file_path = os.path.join(working_directory, "valid_vocabularies.txt")

    # Check if file exists and get suggested ID
    suggested_id = None
    if os.path.exists(json_file_path):
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

    # Initialize directory manager
    dir_manager = DirectoryManager()
    working_directory = dir_manager.prompt_for_directory()
    
    # Get starting ID based on files in working directory
    start_id = get_start_id(working_directory)
    
    # Create and run checker with working directory
    checker = StatusChecker(BASE_URL, start_id, NUM_THREADS, working_directory)
    checker.run()
import requests
from bs4 import BeautifulSoup
import json
import time
import re
import os
from pathlib import Path
from typing import Dict, List, Optional
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

class KlavogonkiVocabularyParser:
    def __init__(self):
        self.base_url = "https://klavogonki.ru/vocs/"
        self.github_url = "https://raw.githubusercontent.com/VimiummuimiV/KG_Latest_Games/refs/heads/main/src/etc/valid_vocabularies.txt"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.type_mapping = {
            'Слова': 'words',
            'Фразы': 'phrases',
            'Тексты': 'texts',
            'Книга': 'books',
            'Генератор': 'generator'
        }
        self.type_mapping_reverse = {v: k for k, v in self.type_mapping.items()}
        self.type_order = ['words', 'phrases', 'texts', 'books', 'generator']
        self.all_vocabularies = []
        self.should_exit = False
        self.lock = threading.Lock()
        self.parsed_count = 0
        
    def detect_language(self, text: str) -> str:
        """Detect if text is Cyrillic, Latin, Mixed, Digits, Symbols, or combination."""
        cyrillic_count = len(re.findall(r'[а-яА-ЯёЁ]', text))
        latin_count = len(re.findall(r'[a-zA-Z]', text))
        digit_count = len(re.findall(r'[0-9]', text))
        symbol_count = len(re.findall(r'[^\w\sа-яА-ЯёЁa-zA-Z0-9]', text))
        
        total_chars = len(re.findall(r'\S', text))
        
        if total_chars == 0:
            return "Пусто"
        
        cyrillic_pct = cyrillic_count / total_chars if total_chars > 0 else 0
        latin_pct = latin_count / total_chars if total_chars > 0 else 0
        digit_pct = digit_count / total_chars if total_chars > 0 else 0
        symbol_pct = symbol_count / total_chars if total_chars > 0 else 0
        
        if digit_pct > 0.7:
            if symbol_pct > 0.15:
                return "Цифры со знаками"
            return "Цифры"
        
        if symbol_pct > 0.7:
            if cyrillic_count > latin_count and cyrillic_count > 0:
                return "Знаки (кирилица)"
            elif latin_count > 0:
                return "Знаки (латиница)"
            return "Знаки"
        
        if digit_pct > 0.3 and symbol_pct > 0.2:
            return "Цифры со знаками"
        
        if cyrillic_pct > 0.7:
            return "Кирилица"
        elif latin_pct > 0.7:
            return "Латиница"
        elif cyrillic_count > 0 and latin_count > 0:
            return "Разнобой"
        elif cyrillic_count > 0:
            return "Кирилица"
        elif latin_count > 0:
            return "Латиница"
        elif digit_count > 0 and symbol_count > 0:
            return "Цифры со знаками"
        elif digit_count > 0:
            return "Цифры"
        elif symbol_count > 0:
            return "Знаки"
        else:
            return "Неизвестно"
    
    def extract_rating(self, soup: BeautifulSoup) -> int:
        """Extract rating from rating_stars class."""
        rating_div = soup.find('div', class_=re.compile(r'rating_stars'))
        if rating_div:
            # Get all classes
            classes = rating_div.get('class', [])
            for cls in classes:
                # Look for rating_stars followed by a number (0-10)
                match = re.search(r'rating_stars(\d+)', cls)
                if match:
                    return int(match.group(1))
        return 0
    
    def fetch_vocabulary_ids(self) -> Dict[str, List[int]]:
        """Fetch vocabulary IDs from GitHub."""
        try:
            response = self.session.get(self.github_url)
            response.raise_for_status()
            data = json.loads(response.text)
            return data.get('validVocabularies', {})
        except Exception as e:
            print(f"Error fetching vocabulary IDs: {e}")
            return {}
    
    def parse_vocabulary_page(self, vocab_id: int, category: str, max_retries: int = 10) -> Optional[Dict]:
        """Parse a single vocabulary page with retry logic."""
        url = f"{self.base_url}{vocab_id}/"
        
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, timeout=15)
                
                if response.status_code == 403:
                    print(f"  ⚠ 403 Forbidden for {vocab_id}, retrying ({attempt + 1}/{max_retries})...")
                    time.sleep(2)
                    continue
                
                response.raise_for_status()
                soup = BeautifulSoup(response.content, 'html.parser')
                
                vocab_data = {
                    'id': vocab_id,
                    'url': url,
                    'category': category,
                    'name': None,
                    'description': None,
                    'author': None,
                    'rating': 0,
                    'users_count': 0,
                    'history_count': 0,
                    'comments_count': 0,
                    'created': None,
                    'is_public': None,
                    'type': None,
                    'language': None,
                    'content': []
                }
                
                # Extract name (title)
                title_td = soup.find('td', class_='title')
                if title_td:
                    title_text = title_td.get_text(strip=True)
                    vocab_data['name'] = re.split(r'\(\d+\)', title_text)[0].strip()
                
                # Extract rating
                vocab_data['rating'] = self.extract_rating(soup)
                
                # Extract users count
                fav_cnt = soup.find('span', id='fav_cnt')
                if fav_cnt:
                    vocab_data['users_count'] = int(fav_cnt.get_text(strip=True))
                
                # Extract history count
                history_link = soup.find('a', href=f'/vocs/{vocab_id}/history/')
                if history_link:
                    history_sub = history_link.find_next('sub')
                    if history_sub:
                        vocab_data['history_count'] = int(history_sub.get_text(strip=True))
                
                # Extract comments count
                comments_sub = soup.find('sub', id='cnt_comments')
                if comments_sub:
                    vocab_data['comments_count'] = int(comments_sub.get_text(strip=True))
                
                # Extract description
                user_content = soup.find('div', class_='user-content')
                if user_content:
                    desc_dd = user_content.find('dt', string='Описание:')
                    if desc_dd:
                        desc_dd = desc_dd.find_next('dd')
                        if desc_dd:
                            vocab_data['description'] = desc_dd.get_text(strip=True)
                    
                    # Extract author
                    author_dd = user_content.find('dt', string='Автор:')
                    if author_dd:
                        author_dd = author_dd.find_next('dd')
                        if author_dd:
                            author_link = author_dd.find('a')
                            if author_link:
                                vocab_data['author'] = author_link.get_text(strip=True)
                    
                    # Extract created date
                    created_dd = user_content.find('dt', string='Создан:')
                    if created_dd:
                        created_dd = created_dd.find_next('dd')
                        if created_dd:
                            created_text = created_dd.get_text(strip=True)
                            vocab_data['created'] = created_text.split('(')[0].strip()
                    
                    # Extract public status
                    public_dd = user_content.find('dt', string=re.compile(r'Публичный:'))
                    if public_dd:
                        public_dd = public_dd.find_next('dd')
                        if public_dd:
                            public_text = public_dd.get_text(strip=True)
                            vocab_data['is_public'] = public_text == 'Да'
                    
                    # Extract vocabulary type
                    type_dd = user_content.find('dt', string='Тип словаря:')
                    if type_dd:
                        type_dd = type_dd.find_next('dd')
                        if type_dd:
                            type_text = type_dd.contents[0].strip() if type_dd.contents else ''
                            type_text = re.sub(r'\s+', ' ', type_text).strip()
                            if type_text == 'URL':
                                print(f"  ⚠ Skipping vocabulary {vocab_id}: URL type")
                                return None
                            vocab_data['type'] = self.type_mapping.get(type_text, type_text)
                    
                    # Extract content
                    content_table = user_content.find('div', class_='words')
                    if content_table:
                        rows = content_table.find_all('tr')
                        all_text = []
                        for row in rows:
                            text_td = row.find('td', class_='text')
                            if text_td:
                                text = text_td.get_text(strip=True)
                                if text and text != '…':
                                    vocab_data['content'].append(text)
                                    all_text.append(text)
                        
                        if all_text:
                            combined_text = ' '.join(all_text)
                            vocab_data['language'] = self.detect_language(combined_text)
                
                return vocab_data
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    print(f"  ⚠ Error fetching {vocab_id}: {e}, retrying ({attempt + 1}/{max_retries})...")
                    time.sleep(2)
                else:
                    print(f"  ✗ Failed to fetch {vocab_id} after {max_retries} attempts: {e}")
                    return None
            except Exception as e:
                print(f"  ✗ Error parsing {vocab_id}: {e}")
                return None
        
        return None
    
    def calculate_column_widths(self, data: List[Dict]) -> Dict[str, int]:
        """Calculate maximum column widths for alignment (used only for file output)."""
        if not data:
            return {
                'id': 4, 'language': 10, 'created': 15,
                'users': 4, 'comments': 3, 'entries': 4
            }
        
        return {
            'id': max(len(str(v['id'])) for v in data),
            'language': max(len(str(v.get('language', ''))) for v in data),
            'created': max(len(str(v.get('created', ''))) for v in data),
            'users': max(len(str(v.get('users_count', 0))) for v in data),
            'comments': max(len(str(v.get('comments_count', 0))) for v in data),
            'entries': max(len(str(len(v.get('content', [])))) for v in data)
        }
    
    def format_vocabulary_line(self, vocab: Dict, widths: Dict[str, int]) -> str:
        """Format a vocabulary entry with name on first line and data on second line."""
        vocab_id = str(vocab['id'])
        vocab_name = str(vocab.get('name', ''))
        vocab_lang = str(vocab.get('language', ''))
        vocab_created = str(vocab.get('created', ''))
        vocab_users = str(vocab.get('users_count', 0))
        vocab_comments = str(vocab.get('comments_count', 0))
        vocab_entries = str(len(vocab.get('content', [])))
        
        # Calculate padding for data line
        id_padding = ' ' * (widths['id'] - len(vocab_id))
        lang_padding = ' ' * (widths['language'] - len(vocab_lang))
        created_padding = ' ' * (widths['created'] - len(vocab_created))
        users_padding = ' ' * (widths['users'] - len(vocab_users))
        comments_padding = ' ' * (widths['comments'] - len(vocab_comments))
        entries_padding = ' ' * (widths['entries'] - len(vocab_entries))
        
        # First line: Name
        name_line = f"    {vocab_name}"
        
        # Second line: All data
        data_line = (
            f"      {vocab_id}{id_padding} | "
            f"{vocab_lang}{lang_padding} | "
            f"Рейтинг: {vocab['rating']} | "
            f"Используют: {vocab_users}{users_padding} | "
            f"Коммент: {vocab_comments}{comments_padding} | "
            f"Создан: {vocab_created}{created_padding} | "
            f"{'Открытый' if vocab['is_public'] else 'Закрытый'} | "
            f"Записей: {vocab_entries}{entries_padding}"
        )
        
        return f"{name_line}\n{data_line}"
    
    def write_vocabularies_by_type(self, f, vocabs: List[Dict], widths: Dict[str, int]):
        """Write vocabularies grouped by type to file."""
        # Group vocabularies by type
        by_type = {}
        for vocab in vocabs:
            vtype = vocab.get('type', 'unknown')
            if vtype not in by_type:
                by_type[vtype] = []
            by_type[vtype].append(vocab)
        
        # Write types in predefined order
        for vtype in self.type_order:
            if vtype not in by_type:
                continue
            
            type_vocabs = by_type[vtype]
            type_name_ru = self.type_mapping_reverse.get(vtype, vtype)
            
            f.write(f"  [{type_name_ru}] ({len(type_vocabs)} шт.)\n")
            
            for vocab in type_vocabs:
                line = self.format_vocabulary_line(vocab, widths)
                f.write(line + "\n")
            
            f.write("\n")
        
        # Write any remaining types not in predefined order
        for vtype in sorted(by_type.keys()):
            if vtype in self.type_order:
                continue
            
            type_vocabs = by_type[vtype]
            type_name_ru = self.type_mapping_reverse.get(vtype, vtype)
            
            f.write(f"  [{type_name_ru}] ({len(type_vocabs)} шт.)\n")
            
            for vocab in type_vocabs:
                line = self.format_vocabulary_line(vocab, widths)
                f.write(line + "\n")
            
            f.write("\n")
    
    def save_to_desktop(self, data: List[Dict], filename: str = "klavogonki_vocabularies"):
        """Save parsed data to Desktop as both text and HTML files, grouped by author and type."""
        desktop = Path.home() / "Desktop"
        txt_filepath = desktop / f"{filename}.txt"
        html_filepath = desktop / f"{filename}.html"
        
        # Group vocabularies by author
        by_author = {}
        for vocab in data:
            author = vocab.get('author') or 'Неизвестный автор'
            if author not in by_author:
                by_author[author] = []
            by_author[author].append(vocab)
        
        # Sort authors by vocabulary count (descending)
        sorted_authors = sorted(by_author.keys(), key=lambda x: len(by_author[x]), reverse=True)
        
        # Calculate maximum widths for alignment
        widths = self.calculate_column_widths(data)
        
        try:
            # Save TXT file
            with open(txt_filepath, 'w', encoding='utf-8') as f:
                f.write("=" * 150 + "\n")
                f.write("РЕЗУЛЬТАТЫ ПАРСИНГА СЛОВАРЕЙ КЛАВОГОНОК\n")
                f.write(f"Всего распарсено: {len(data)} словарей от {len(by_author)} авторов\n")
                f.write("=" * 150 + "\n\n")
                
                for author in sorted_authors:
                    vocabs = by_author[author]
                    
                    f.write(f"\n{'#' * 150}\n")
                    f.write(f"АВТОР: {author} ({len(vocabs)} словарей)\n")
                    f.write(f"{'#' * 150}\n\n")
                    
                    self.write_vocabularies_by_type(f, vocabs, widths)
            
            print(f"\n✓ Текстовый файл сохранен в {txt_filepath}")
            
            # Save HTML file
            with open(html_filepath, 'w', encoding='utf-8') as f:
                f.write("""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Словари Клавогонок</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tabulator-tables@6.3.0/dist/css/tabulator.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #667eea;
        }
        .header h1 {
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 15px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .header .stats {
            font-size: 1.2em;
            color: #555;
            margin-top: 10px;
        }
        .search-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
            margin: 30px 0;
            padding: 15px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .search-container select,
        .search-container input {
            padding: 12px 20px;
            border: 2px solid #e9ecef;
            border-radius: 25px;
            font-size: 1em;
            transition: all 0.3s ease;
            outline: none;
        }
        .search-container select:focus,
        .search-container input:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
        }
        .author-section {
            margin-bottom: 50px;
            background: linear-gradient(to right, #f8f9fa, #ffffff);
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.07);
        }
        .author-header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
        }
        .author-header h2 {
            font-size: 1.8em;
            margin-bottom: 5px;
        }
        .author-header .count {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .type-section {
            margin-bottom: 25px;
        }
        .type-header {
            background: #f1f3f5;
            padding: 12px 20px;
            border-radius: 6px;
            margin-bottom: 15px;
            border-left: 4px solid #667eea;
            font-weight: 600;
            color: #495057;
            font-size: 1.1em;
        }
        .tabulator-table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .tabulator .tabulator-header {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .tabulator .tabulator-header .tabulator-col {
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 0.95em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tabulator .tabulator-row .tabulator-cell {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
            font-size: 0.95em;
        }
        .tabulator .tabulator-row:last-child .tabulator-cell {
            border-bottom: none;
        }
        .tabulator .tabulator-row {
            transition: background-color 0.2s ease;
        }
        .tabulator .tabulator-row:hover {
            background-color: #f8f9fa;
        }
        .vocab-id {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 4px;
            transition: all 0.2s ease;
            display: inline-block;
        }
        .vocab-id:hover {
            background: #667eea;
            color: white;
            transform: translateX(3px);
        }
        .rating {
            color: #ffc107;
            font-weight: 600;
        }
        .rating::after {
            content: ' ⭐';
        }
        .badge {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            display: inline-block;
        }
        .badge-open {
            background: #d4edda;
            color: #155724;
        }
        .badge-closed {
            background: #f8d7da;
            color: #721c24;
        }
        .lang-badge {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            background: #e7f5ff;
            color: #1864ab;
        }
        .stat {
            color: #6c757d;
            font-size: 0.9em;
        }
        @media (max-width: 1200px) {
            .tabulator {
                font-size: 0.85em;
            }
            .tabulator .tabulator-col, .tabulator .tabulator-row .tabulator-cell {
                padding: 10px 8px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 Словари Клавогонок</h1>
            <div class="stats">
                <strong>Всего распарсено:</strong> """ + str(len(data)) + """ словарей от """ + str(len(by_author)) + """ авторов
            </div>
        </div>
        <div class="search-container">
            <select id="searchMode">
                <option value="author">Поиск по автору</option>
                <option value="id">Поиск по ID</option>
                <option value="name">Поиск по названию</option>
                <option value="language">Поиск по языку</option>
                <option value="rating">Поиск по рейтингу</option>
                <option value="users">Поиск по используют</option>
                <option value="comments">Поиск по комментариям</option>
                <option value="created">Поиск по создан</option>
                <option value="access">Поиск по доступу</option>
                <option value="entries">Поиск по записям</option>
            </select>
            <input type="text" id="searchInput" placeholder="Введите поисковый запрос...">
        </div>
""")
                
                table_scripts = []
                counter = 0
                
                for author in sorted_authors:
                    vocabs = by_author[author]
                    
                    f.write(f"""
        <div class="author-section">
            <div class="author-header">
                <h2>👤 {author}</h2>
                <div class="count">{len(vocabs)} словарей</div>
            </div>
""")
                    
                    # Group vocabularies by type
                    by_type = {}
                    for vocab in vocabs:
                        vtype = vocab.get('type', 'unknown')
                        if vtype not in by_type:
                            by_type[vtype] = []
                        by_type[vtype].append(vocab)
                    
                    # Write types in predefined order
                    all_types = []
                    for vtype in self.type_order:
                        if vtype in by_type:
                            all_types.append(vtype)
                    # Add remaining types
                    for vtype in sorted(by_type.keys()):
                        if vtype not in all_types:
                            all_types.append(vtype)
                    
                    for vtype in all_types:
                        type_vocabs = by_type[vtype]
                        type_name_ru = self.type_mapping_reverse.get(vtype, vtype)
                        counter += 1
                        unique_id = f"table_{counter}"
                        
                        data_list = []
                        for vocab in type_vocabs:
                            data_list.append({
                                'id': vocab['id'],
                                'url': vocab['url'],
                                'name': vocab.get('name', 'N/A'),
                                'language': vocab.get('language', 'N/A'),
                                'rating': vocab['rating'],
                                'users_count': vocab.get('users_count', 0),
                                'comments_count': vocab.get('comments_count', 0),
                                'created': vocab.get('created', 'N/A'),
                                'is_public': vocab.get('is_public', False),
                                'access_text': 'Открытый' if vocab.get('is_public') else 'Закрытый',
                                'entries': len(vocab.get('content', []))
                            })
                        
                        f.write(f"""
            <div class="type-section">
                <div class="type-header">📖 {type_name_ru} ({len(type_vocabs)} шт.)</div>
                <div id="{unique_id}" class="tabulator-table"></div>
            </div>
""")
                        
                        table_scripts.append(f"var tableData_{unique_id} = {json.dumps(data_list)};")
                        table_scripts.append(f"""
var table_{unique_id} = new Tabulator("#{unique_id}", {{
    data: tableData_{unique_id},
    layout: "fitColumns",
    columns: [
        {{title:"ID", field:"id", formatter: function(cell){{ return `<a href="${{cell.getRow().getData().url}}" target="_blank" class="vocab-id">${{cell.getValue()}}</a>`; }}}},
        {{title:"Название", field:"name", formatter: function(cell){{ var val = cell.getValue(); return `<strong title="${{val}}">${{val.length > 60 ? val.slice(0,57)+'...' : val}}</strong>`; }}}},
        {{title:"Язык", field:"language", formatter: function(cell){{ return `<span class="lang-badge">${{cell.getValue()}}</span>`; }}}},
        {{title:"Рейтинг", field:"rating", formatter: function(cell){{ return `<span class="rating">${{cell.getValue()}}</span>`; }}}},
        {{title:"Используют", field:"users_count", cssClass:"stat"}},
        {{title:"Комментариев", field:"comments_count", cssClass:"stat"}},
        {{title:"Создан", field:"created", cssClass:"stat"}},
        {{title:"Доступ", field:"access_text", formatter: function(cell){{ var data = cell.getRow().getData(); var badge = data.is_public ? 'badge-open' : 'badge-closed'; return `<span class="badge ${{badge}}">${{cell.getValue()}}</span>`; }}}},
        {{title:"Записей", field:"entries", cssClass:"stat"}},
    ],
    height: Math.min(400, 50 + (tableData_{unique_id}.length * 40))  // Dynamic height with 400px max
}});
tables.push(table_{unique_id});
""")
                    
                    f.write("""
        </div>
""")
                
                f.write("""
    </div>
    <script src="https://cdn.jsdelivr.net/npm/tabulator-tables@6.3.0/dist/js/tabulator.min.js"></script>
    <script>
        var tables = [];
        """ + '\n'.join(table_scripts) + """
    </script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('searchInput');
            const searchMode = document.getElementById('searchMode');

            function filterContent() {
                const term = searchInput.value.toLowerCase().trim();
                const mode = searchMode.value;

                if (!term) {
                    tables.forEach(t => t.clearFilter());
                    document.querySelectorAll('.author-section, .type-section').forEach(el => el.style.display = '');
                } else if (mode === 'author') {
                    tables.forEach(t => t.clearFilter());
                    const authors = document.querySelectorAll('.author-section');
                    authors.forEach(author => {
                        const authorName = author.querySelector('.author-header h2').textContent.toLowerCase();
                        const shouldShowAuthor = authorName.includes(term);
                        author.style.display = shouldShowAuthor ? '' : 'none';
                        if (shouldShowAuthor) {
                            author.querySelectorAll('.type-section').forEach(type => type.style.display = '');
                        }
                    });
                } else {
                    const fieldMap = {
                        'id': 'id',
                        'name': 'name',
                        'language': 'language',
                        'rating': 'rating',
                        'users': 'users_count',
                        'comments': 'comments_count',
                        'created': 'created',
                        'access': 'access_text',
                        'entries': 'entries',
                    };
                    const numberFields = ['id', 'rating', 'users_count', 'comments_count', 'entries'];

                    const field = fieldMap[mode];
                    if (field) {
                        const parsedTerm = parseFloat(term);
                        const isNumber = !isNaN(parsedTerm);
                        const filterType = numberFields.includes(field) && isNumber ? '=' : 'like';
                        const filterValue = isNumber ? parsedTerm : term;
                        tables.forEach(table => {
                            table.setFilter(field, filterType, filterValue);
                        });

                        document.querySelectorAll('.type-section').forEach(type => {
                            const tableEl = type.querySelector('.tabulator-table');
                            if (tableEl) {
                                const table = Tabulator.findTable('#' + tableEl.id)[0];
                                if (table) {
                                    const visibleRows = table.getRows('active').length;
                                    type.style.display = visibleRows > 0 ? '' : 'none';
                                }
                            }
                        });

                        const authors = document.querySelectorAll('.author-section');
                        authors.forEach(author => {
                            const visibleTypes = author.querySelectorAll('.type-section:not([style*="display: none"])').length;
                            author.style.display = visibleTypes > 0 ? '' : 'none';
                        });
                    }
                }

                // Adjust table heights for visible tables
                tables.forEach(table => {
                    table.redraw();
                    const typeSection = table.element.closest('.type-section');
                    if (typeSection && typeSection.style.display !== 'none') {
                        const headerHeight = table.header.element.offsetHeight || 50;
                        const rowsHeight = table.rowManager.element.offsetHeight;
                        const calculatedHeight = headerHeight + rowsHeight;
                        const newHeight = Math.min(400, calculatedHeight);
                        table.setHeight(newHeight);
                        table.redraw(true);
                    }
                });
            }

            searchInput.addEventListener('input', filterContent);
            searchMode.addEventListener('change', filterContent);
            filterContent(); // Initial call to set heights
        });
    </script>
</body>
</html>
""")
            
            print(f"✓ HTML файл сохранен в {html_filepath}")
            print(f"✓ Сгруппировано по {len(by_author)} авторам")
                    
        except Exception as e:
            print(f"Ошибка сохранения в файл: {e}")
            import traceback
            traceback.print_exc()
    
    def listen_for_exit(self):
        """Listen for 'q' key to exit."""
        try:
            import msvcrt  # Windows
            while not self.should_exit:
                if msvcrt.kbhit():
                    key = msvcrt.getch().decode('utf-8').lower()
                    if key == 'q':
                        print("\n\n⚠ Exit requested! Saving data...")
                        self.should_exit = True
                        break
                time.sleep(0.1)
        except ImportError:
            # Unix-like systems
            import sys
            import tty
            import termios
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            try:
                tty.setcbreak(fd)
                while not self.should_exit:
                    ch = sys.stdin.read(1).lower()
                    if ch == 'q':
                        print("\n\n⚠ Exit requested! Saving data...")
                        self.should_exit = True
                        break
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    
    def format_console_line(self, vocab: Dict) -> str:
        """Format vocabulary line for console output (simplified, no alignment)."""
        return (
            f"{vocab['id']} | {vocab.get('name', 'N/A')} | "
            f"{vocab.get('language', 'N/A')} | Рейтинг: {vocab['rating']} | "
            f"Используют: {vocab.get('users_count', 0)} | "
            f"Коммент: {vocab.get('comments_count', 0)} | "
            f"Создан: {vocab.get('created', 'N/A')} | "
            f"{'Открытый' if vocab.get('is_public') else 'Закрытый'} | "
            f"Записей: {len(vocab.get('content', []))}"
        )
    
    def parse_all_vocabularies(self, delay: float = 0.5, max_workers: int = 10) -> List[Dict]:
        """Parse all vocabularies from all categories using multiple threads."""
        vocab_ids = self.fetch_vocabulary_ids()
        
        # Flatten all vocab IDs with their categories
        tasks = []
        for category, ids in vocab_ids.items():
            for vocab_id in ids:
                tasks.append((vocab_id, category))
        
        total_count = len(tasks)
        self.parsed_count = 0
        
        # Start exit listener thread
        exit_thread = threading.Thread(target=self.listen_for_exit, daemon=True)
        exit_thread.start()
        
        print("\nPress 'q' to exit and save current progress\n")
        print(f"Starting parsing with {max_workers} threads...\n")
        
        # Use ThreadPoolExecutor for concurrent parsing
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_vocab = {
                executor.submit(self.parse_vocabulary_page, vocab_id, category): (vocab_id, category)
                for vocab_id, category in tasks
            }
            
            # Process completed tasks
            for future in as_completed(future_to_vocab):
                if self.should_exit:
                    executor.shutdown(wait=False, cancel_futures=True)
                    break
                
                vocab_id, category = future_to_vocab[future]
                
                with self.lock:
                    self.parsed_count += 1
                    current = self.parsed_count
                
                try:
                    vocab_data = future.result()
                    
                    if vocab_data:
                        with self.lock:
                            self.all_vocabularies.append(vocab_data)
                        
                        # Use simplified console formatting (no alignment)
                        line = self.format_console_line(vocab_data)
                        print(f"[{current}/{total_count}] ✓ {line}")
                    else:
                        print(f"[{current}/{total_count}] ✗ {vocab_id}: Failed to parse")
                        
                except Exception as e:
                    print(f"[{current}/{total_count}] ✗ {vocab_id}: Error - {e}")
                
                # Small delay to avoid overwhelming the server
                time.sleep(delay / max_workers)
        
        return self.all_vocabularies


def main():
    parser = KlavogonkiVocabularyParser()
    
    print("Fetching vocabulary IDs...")
    vocab_ids = parser.fetch_vocabulary_ids()
    
    total = sum(len(ids) for ids in vocab_ids.values())
    print(f"Found {total} vocabularies across {len(vocab_ids)} categories")
    
    print("\nStarting to parse vocabularies...")
    print("=" * 80)
    
    vocabularies = parser.parse_all_vocabularies(delay=0.5)
    
    print(f"\n{'='*80}")
    print(f"Parsing complete!")
    print(f"Successfully parsed: {len(vocabularies)}/{total} vocabularies")
    
    parser.save_to_desktop(vocabularies)
    
    # Display sample of results
    if vocabularies:
        print(f"\nSample vocabulary:")
        sample = vocabularies[0]
        print(f"  ID: {sample['id']}")
        print(f"  Name: {sample.get('name', 'N/A')}")
        print(f"  Category: {sample.get('category', 'N/A')}")
        print(f"  Type: {sample.get('type', 'N/A')}")
        print(f"  Language: {sample.get('language', 'N/A')}")
        print(f"  Rating: {sample['rating']}/5")
        print(f"  Users: {sample['users_count']}")
        print(f"  Content entries: {len(sample.get('content', []))}")


if __name__ == "__main__":
    main()
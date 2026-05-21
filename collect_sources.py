"""
Сборка содержимого файлов проекта в один текстовый файл.

Использование:
    python collect_sources.py
        — берёт список файлов из input.txt в текущей директории,
          результат пишет в output.txt.

    python collect_sources.py --input mylist.txt --output result.txt
        — явное указание путей.

Формат input.txt — по одному пути на строку, относительно текущей директории
(в которой запущена программа; предполагается, что это корень проекта).
Строки, начинающиеся с # либо пустые, игнорируются.

Формат output.txt:

    Содержимое файла <относительный путь>:

    <содержимое файла>

    Содержимое файла <относительный путь>:

    <содержимое файла>
    ...

Между блоками — две пустые строки. Файлы, которые не удалось прочитать
(отсутствуют, нет прав, бинарные), отмечаются строкой
"<НЕ УДАЛОСЬ ПРОЧИТАТЬ: причина>" и обработка продолжается.
"""

import argparse
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description='Собрать содержимое файлов проекта в один txt-файл.'
    )
    parser.add_argument(
        '--input', '-i', default='input.txt',
        help='Файл со списком путей (по умолчанию: input.txt)',
    )
    parser.add_argument(
        '--output', '-o', default='output.txt',
        help='Файл для сборки (по умолчанию: output.txt)',
    )
    return parser.parse_args()


def read_file_list(input_path: Path) -> list[str]:
    """Прочитать список путей из input.txt, пропустить пустые и комментарии."""
    if not input_path.exists():
        sys.exit(f'Файл со списком не найден: {input_path}')
    lines = input_path.read_text(encoding='utf-8').splitlines()
    result = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        result.append(line)
    return result


def read_file_content(path: Path) -> tuple[str, str | None]:
    """
    Прочитать содержимое файла.
    Возвращает (content, error). Если успешно — error=None.
    Если файл бинарный или не прочитался — content='', error=<причина>.
    """
    if not path.exists():
        return '', 'файл не найден'
    if not path.is_file():
        return '', 'не является файлом'
    try:
        return path.read_text(encoding='utf-8'), None
    except UnicodeDecodeError:
        return '', 'бинарный файл, не текст'
    except PermissionError:
        return '', 'нет прав на чтение'
    except OSError as e:
        return '', f'ошибка чтения: {e}'


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    file_list = read_file_list(input_path)
    if not file_list:
        sys.exit('Список файлов пуст.')

    total = len(file_list)
    successful = 0
    failed = []

    with output_path.open('w', encoding='utf-8') as out:
        for idx, rel_path in enumerate(file_list, 1):
            file_path = Path(rel_path)
            content, error = read_file_content(file_path)

            out.write(f'Содержимое файла {rel_path}:\n\n')
            if error is not None:
                out.write(f'<НЕ УДАЛОСЬ ПРОЧИТАТЬ: {error}>\n')
                failed.append((rel_path, error))
            else:
                out.write(content)
                if not content.endswith('\n'):
                    out.write('\n')
                successful += 1

            # Разделитель между файлами (кроме последнего)
            if idx < total:
                out.write('\n\n')

    print(f'Готово: {successful}/{total} файлов записано в {output_path}.')
    if failed:
        print(f'Не удалось прочитать {len(failed)} файлов:')
        for rel_path, error in failed:
            print(f'  - {rel_path}: {error}')


if __name__ == '__main__':
    main()

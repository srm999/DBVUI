import sys
import zipfile
from xml.etree import ElementTree as ET

XLSX = sys.argv[1] if len(sys.argv) > 1 else 'TestQueryPairs.xlsx'
SHEET = sys.argv[2] if len(sys.argv) > 2 else 'xl/worksheets/sheet1.xml'

with zipfile.ZipFile(XLSX) as z:
    shared = z.read('xl/sharedStrings.xml')
    sst = ET.fromstring(shared)
    ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    texts = []
    for si in sst.findall('a:si', ns):
        t = si.find('a:t', ns)
        if t is not None:
            texts.append((t.text or '').strip())
        else:
            acc = []
            for r in si.findall('a:r', ns):
                tt = r.find('a:t', ns)
                if tt is not None:
                    acc.append(tt.text or '')
            texts.append(''.join(acc).strip())

    sh = ET.fromstring(z.read(SHEET))
    # Find first row cells
    row = sh.find('.//a:sheetData/a:row[@r="1"]', ns)
    out = []
    for c in row.findall('a:c', ns):
        t = c.get('t')
        v = c.find('a:v', ns)
        if t == 's' and v is not None:
            idx = int(v.text)
            out.append(texts[idx])
        else:
            out.append(v.text if v is not None else '')
    print(','.join(out))


import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("L")
esik = int(sys.argv[3]) if len(sys.argv) > 3 else 150
im.point(lambda p: 255 if p > esik else 0).save(sys.argv[2])

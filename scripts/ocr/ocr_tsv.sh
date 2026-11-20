#!/bin/bash
# Kullanim: ocr_tsv.sh <pdf> <pdf_sayfa> <kitap_sayfa> <scratchpad> [esik]
# ocr_sayfa.sh ile ayni kirpma; sutun PNG'sini saklar, satir konumlu TSV uretir.
PDF="$1"; P="$2"; K="$3"; S="$4"; ESIK="$5"
NN=$(printf "%03d" "$K")
if (( K % 2 == 0 )); then LX=150; LW=1090; RX=1225; RW=1243; else LX=0; LW=1240; RX=1225; RW=1095; fi
pdftoppm -f "$P" -l "$P" -r 300 -gray -x $LX -y 230 -W $LW -H 3150 -png -singlefile "$PDF" "$S/ocr/png/k$NN-L" 2>/dev/null
pdftoppm -f "$P" -l "$P" -r 300 -gray -x $RX -y 230 -W $RW -H 3150 -png -singlefile "$PDF" "$S/ocr/png/k$NN-R" 2>/dev/null
for s in L R; do
  IMG="$S/ocr/png/k$NN-$s.png"
  if [ -n "$ESIK" ]; then
    T=$(mktemp --suffix=.png); python3 -I "$S/araclar/esik.py" "$IMG" "$T" "$ESIK"; IMG="$T"
  fi
  tesseract "$IMG" "$S/ocr/tsv/k$NN-$s" -l tur --psm 4 tsv >/dev/null 2>&1
  [ -n "$ESIK" ] && rm -f "$T"
done

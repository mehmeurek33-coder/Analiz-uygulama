#!/bin/bash
# Kullanim: ocr_sayfa.sh <pdf> <pdf_sayfa> <kitap_sayfa> <cikis_dizini>
# Kitap sayfasi cift ise yan sekme solda, tek ise sagda: dis kenari kirp, sutunlari ayri OCR'la.
PDF="$1"; P="$2"; K="$3"; OUT="$4"
TMP=$(mktemp -d)
if (( K % 2 == 0 )); then LX=150; LW=1090; RX=1225; RW=1243; else LX=0; LW=1240; RX=1225; RW=1095; fi
pdftoppm -f "$P" -l "$P" -r 300 -gray -x $LX -y 230 -W $LW -H 3150 -png "$PDF" "$TMP/L" 2>/dev/null
pdftoppm -f "$P" -l "$P" -r 300 -gray -x $RX -y 230 -W $RW -H 3150 -png "$PDF" "$TMP/R" 2>/dev/null
NN=$(printf "%03d" "$K")
tesseract "$TMP"/L-*.png "$OUT/k$NN-L" -l tur --psm 4 >/dev/null 2>&1
tesseract "$TMP"/R-*.png "$OUT/k$NN-R" -l tur --psm 4 >/dev/null 2>&1
rm -rf "$TMP"

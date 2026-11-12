#!/usr/bin/env python3
"""
Tarik data harga harian saham Bursa Malaysia dari Yahoo Finance dan
hasilkan fail CSV untuk apps Penapis Saham Bursa.

Pemasangan (sekali sahaja):
    pip install yfinance pandas

Cara guna:
    Kali pertama, tarik kira-kira 6 bulan data sejarah:
        python tarik_data_bursa.py --hari 130

    Setiap petang selepas pasaran tutup (selepas 5:30 petang):
        python tarik_data_bursa.py

Senarai kaunter dibaca dari senarai_saham.txt (satu kod setiap baris).
Fail CSV disimpan dalam folder "output" dengan nama bursa_YYYY-MM-DD.csv.
Muat naik fail itu ke tab Data dalam apps.

Nota: Yahoo Finance bukan sumber rasmi Bursa. Data boleh lewat, tertinggal
atau berubah format tanpa amaran. Semak sekali-sekala dengan platform broker.
"""
import argparse
import csv
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Rangkaian dengan firewall yang memeriksa HTTPS (cth. McAfee MAMPU/GITN) guna
# sijil sendiri yang tiada dalam certifi. Jika ca_bundle.pem ada (certifi +
# sijil firewall), suruh curl_cffi (digunakan yfinance) percaya fail itu.
_CA_BUNDLE = Path(__file__).resolve().parent / "ca_bundle.pem"
if _CA_BUNDLE.exists():
    os.environ.setdefault("CURL_CA_BUNDLE", str(_CA_BUNDLE))

try:
    import pandas as pd
    import yfinance as yf
except ImportError:
    print("Sila pasang dulu: pip install yfinance pandas")
    sys.exit(1)

FOLDER = Path(__file__).resolve().parent
FAIL_SENARAI = FOLDER / "senarai_saham.txt"
FAIL_SAHAM = FOLDER / "jumlah_saham.csv"  # simpanan jumlah saham beredar
FOLDER_OUTPUT = FOLDER / "output"
FAIL_JSON = FOLDER / "docs" / "data" / "bursa.json"  # data untuk website
MAKS_HARI_JSON = 150        # bilangan hari sejarah disimpan untuk website
SAIZ_KUMPULAN = 40         # bilangan kaunter setiap permintaan ke Yahoo
JAM_LENGKAP = (17, 30)      # selepas waktu ini, data hari ini dianggap lengkap


def masa_malaysia():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    except Exception:
        return datetime.now(timezone.utc) + timedelta(hours=8)


def baca_senarai(path):
    kod = []
    for baris in Path(path).read_text(encoding="utf-8").splitlines():
        k = baris.split("#")[0].strip().upper().replace(".KL", "")
        if k and k not in kod:
            kod.append(k)
    return kod


def baca_simpanan_saham():
    data = {}
    if FAIL_SAHAM.exists():
        with FAIL_SAHAM.open(encoding="utf-8", newline="") as f:
            for r in csv.reader(f):
                if len(r) >= 2:
                    try:
                        n = int(float(r[1]))
                    except ValueError:
                        continue
                    if n > 0:
                        data[r[0].strip().upper()] = n
    return data


def simpan_simpanan_saham(data):
    with FAIL_SAHAM.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["simbol", "jumlah_saham"])
        for k in sorted(data):
            w.writerow([k, data[k]])


def tarik_jumlah_saham(kod):
    """Cuba dapatkan jumlah saham beredar. Pulangkan None jika gagal."""
    t = yf.Ticker(kod + ".KL")
    n = None
    try:
        n = t.fast_info["shares"]
    except Exception:
        pass
    if not n:
        try:
            n = (t.info or {}).get("sharesOutstanding")
        except Exception:
            pass
    try:
        n = int(n)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def tarik_harga(senarai_kod, hari):
    """Pulangkan dict: kod -> DataFrame harga harian (Open, High, Low, Close, Volume)."""
    mula = (datetime.now() - timedelta(days=int(hari * 1.6) + 10)).strftime("%Y-%m-%d")
    hasil = {}
    for i in range(0, len(senarai_kod), SAIZ_KUMPULAN):
        kumpulan = senarai_kod[i:i + SAIZ_KUMPULAN]
        tickers = [k + ".KL" for k in kumpulan]
        print(f"  Menarik {i + 1}-{i + len(kumpulan)} daripada {len(senarai_kod)} kaunter...")
        data = None
        for cubaan in range(3):
            try:
                data = yf.download(tickers, start=mula, interval="1d", group_by="ticker",
                                   auto_adjust=False, actions=False, threads=True, progress=False)
                break
            except Exception as e:
                print(f"  Ralat ({e}). Cuba lagi dalam {5 * (cubaan + 1)} saat...")
                time.sleep(5 * (cubaan + 1))
        if data is None or data.empty:
            continue
        for kod, ticker in zip(kumpulan, tickers):
            try:
                df = data[ticker] if isinstance(data.columns, pd.MultiIndex) else data
            except KeyError:
                continue
            if "Close" not in df.columns:
                continue
            df = df.dropna(subset=["Close"])
            df = df[df["Close"] > 0]
            if not df.empty:
                hasil[kod] = df.tail(hari)
        time.sleep(1)
    return hasil


def nombor(x, ganti):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return ganti
    return ganti if math.isnan(x) else x


def kemas_kini_json(harga, saham, senarai, masa):
    """Gabung data baharu ke dalam docs/data/bursa.json untuk website.

    Format setiap kaunter: "YYYYMMDD,open,high,low,close,volume;..." (sama
    seperti format simpanan dalam app Penapis Saham Bursa).
    """
    import json
    lama = {}
    if FAIL_JSON.exists():
        try:
            lama = json.loads(FAIL_JSON.read_text(encoding="utf-8")).get("prices", {})
        except ValueError:
            lama = {}
    prices = {}
    for kod in senarai:  # kaunter yang dibuang dari senarai tidak disimpan lagi
        baris = {}
        for r in filter(None, lama.get(kod, "").split(";")):
            baris[r.split(",")[0]] = r
        if kod in harga:
            for tarikh, r in harga[kod].iterrows():
                close = nombor(r["Close"], None)
                if close is None:
                    continue
                t = tarikh.strftime("%Y%m%d")
                baris[t] = ",".join([
                    t,
                    f"{nombor(r.get('Open'), close):g}",
                    f"{nombor(r.get('High'), close):g}",
                    f"{nombor(r.get('Low'), close):g}",
                    f"{close:g}",
                    str(int(nombor(r.get("Volume"), 0))),
                ])
        if baris:
            prices[kod] = ";".join(baris[t] for t in sorted(baris)[-MAKS_HARI_JSON:])
    data = {
        "updated": masa.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "prices": prices,
        "shares": {k: saham[k] for k in prices if k in saham},
    }
    FAIL_JSON.parent.mkdir(parents=True, exist_ok=True)
    FAIL_JSON.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return len(prices)


def main():
    ap = argparse.ArgumentParser(description="Tarik data harga harian Bursa untuk apps Penapis Saham Bursa.")
    ap.add_argument("--hari", type=int, default=10,
                    help="Bilangan hari dagangan untuk ditarik (lalai 10). Guna 130 untuk kali pertama.")
    ap.add_argument("--termasuk-hari-ini", action="store_true",
                    help="Masukkan data hari ini walaupun pasaran belum tutup (data belum lengkap).")
    ap.add_argument("--kemas-kini-saham", action="store_true",
                    help="Tarik semula jumlah saham beredar untuk semua kaunter.")
    ap.add_argument("--senarai", default=str(FAIL_SENARAI),
                    help="Fail senarai kod saham (lalai: senarai_saham.txt).")
    args = ap.parse_args()

    if not Path(args.senarai).exists():
        print(f"Fail senarai tidak dijumpai: {args.senarai}")
        sys.exit(1)
    senarai = baca_senarai(args.senarai)
    if not senarai:
        print("Senarai saham kosong. Tambah kod saham dalam senarai_saham.txt.")
        sys.exit(1)

    if not FAIL_JSON.exists() and args.hari < MAKS_HARI_JSON:
        print(f"Data website belum ada, jadi tarik {MAKS_HARI_JSON} hari sejarah dahulu.")
        args.hari = MAKS_HARI_JSON

    print(f"Menarik harga {len(senarai)} kaunter untuk {args.hari} hari dagangan terakhir...")
    harga = tarik_harga(senarai, args.hari)

    # Buang baris hari ini jika pasaran belum tutup, supaya penapis tak guna data separuh hari
    sekarang = masa_malaysia()
    tarikh_hari_ini = sekarang.strftime("%Y-%m-%d")
    belum_tutup = (sekarang.hour, sekarang.minute) < JAM_LENGKAP
    dibuang_hari_ini = False
    if belum_tutup and not args.termasuk_hari_ini:
        for kod in list(harga):
            df = harga[kod]
            tarikh = [d.strftime("%Y-%m-%d") for d in df.index]
            if tarikh_hari_ini in tarikh:
                harga[kod] = df[[t != tarikh_hari_ini for t in tarikh]]
                dibuang_hari_ini = True

    # Jumlah saham beredar: guna simpanan, tarik yang belum ada sahaja
    saham = baca_simpanan_saham()
    perlu = [k for k in harga if args.kemas_kini_saham or k not in saham]
    if perlu:
        print(f"Menarik jumlah saham beredar untuk {len(perlu)} kaunter...")
        for kod in perlu:
            n = tarik_jumlah_saham(kod)
            if n:
                saham[kod] = n
            time.sleep(0.3)
        simpan_simpanan_saham(saham)

    FOLDER_OUTPUT.mkdir(exist_ok=True)
    fail_output = FOLDER_OUTPUT / f"bursa_{tarikh_hari_ini}.csv"
    bil_baris = 0
    with fail_output.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["simbol", "tarikh", "open", "high", "low", "close", "volume", "jumlah_saham"])
        for kod in sorted(harga):
            for tarikh, r in harga[kod].iterrows():
                close = nombor(r["Close"], None)
                if close is None:
                    continue
                w.writerow([
                    kod,
                    tarikh.strftime("%Y-%m-%d"),
                    f"{nombor(r.get('Open'), close):.3f}",
                    f"{nombor(r.get('High'), close):.3f}",
                    f"{nombor(r.get('Low'), close):.3f}",
                    f"{close:.3f}",
                    int(nombor(r.get("Volume"), 0)),
                    saham.get(kod, ""),
                ])
                bil_baris += 1

    bil_json = kemas_kini_json(harga, saham, senarai, sekarang)

    tiada_data = [k for k in senarai if k not in harga or harga[k].empty]
    tiada_saham = [k for k in harga if k not in saham]
    print()
    print(f"Siap: {bil_baris} baris untuk {len(senarai) - len(tiada_data)} kaunter.")
    print(f"Fail: {fail_output}")
    print(f"Website: {FAIL_JSON} ({bil_json} kaunter)")
    if dibuang_hari_ini:
        print("Pasaran belum tutup, jadi data hari ini tidak dimasukkan. Jalankan semula selepas 5:30 petang.")
    if tiada_data:
        print(f"Tiada data dari Yahoo untuk: {', '.join(tiada_data)} (semak kod saham).")
    if tiada_saham:
        print(f"Jumlah saham beredar tidak dijumpai untuk: {', '.join(tiada_saham)}.")
        print("  Tambah sendiri dalam jumlah_saham.csv (simbol,jumlah_saham).")


if __name__ == "__main__":
    main()
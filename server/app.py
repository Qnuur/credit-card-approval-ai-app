from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import os
import joblib

# TensorFlow opsiyonel: model yoksa scorecard ile çalışır
try:
    import tensorflow as tf
except Exception:
    tf = None

app = Flask(__name__)
CORS(app)

# =========================================================
# 0) CONFIG (daha gerçekçi ve dengeli)
# =========================================================
CFG = {
    "AGE_MIN": float(os.getenv("AGE_MIN", 18)),

    # borç/limit davranışı - daha gerçekçi hard stoplar
    "DTI_WARN": float(os.getenv("DTI_WARN", 0.55)),
    "DTI_HARD": float(os.getenv("DTI_HARD", 0.80)),

    "UTIL_WARN": float(os.getenv("UTIL_WARN", 0.80)),
    "UTIL_HARD": float(os.getenv("UTIL_HARD", 0.97)),

    # limit çok küçükse util oranı abartmasın diye taban
    "LIMIT_BASE": float(os.getenv("LIMIT_BASE", 5000)),

    # gecikme
    "DELAY_HARD": float(os.getenv("DELAY_HARD", 2)),

    # gelir segmentleri
    "INCOME_LOW": float(os.getenv("INCOME_LOW", 12000)),
    "INCOME_GOOD": float(os.getenv("INCOME_GOOD", 30000)),
    "INCOME_VERY_GOOD": float(os.getenv("INCOME_VERY_GOOD", 60000)),

    # ödeme oranı
    "PAYMENT_RATE_LOW": float(os.getenv("PAYMENT_RATE_LOW", 50)),
    "PAYMENT_RATE_GOOD": float(os.getenv("PAYMENT_RATE_GOOD", 85)),

    # final karar bandı
    "APPROVE_TH": float(os.getenv("APPROVE_TH", 0.60)),
    "REVIEW_TH": float(os.getenv("REVIEW_TH", 0.45)),

    # model/scorecard harmanı: senin şikayet için daha düşük yaptım
    # (gelir/kıdem/eğitim/varlık artınca etkisi net görünür)
    "BLEND_ALPHA": float(os.getenv("BLEND_ALPHA", 0.40)),
}

MODEL_PATH = os.getenv("MODEL_PATH", "kredi_modeli.h5")
SCALER_PATH = os.getenv("SCALER_PATH", "scaler.pkl")

model = None
scaler = None

# =========================================================
# 1) MODEL & SCALER LOAD (opsiyonel)
# =========================================================
try:
    scaler = joblib.load(SCALER_PATH)
    print("✅ Scaler yüklendi.")
except Exception as e:
    print(f"⚠️ Scaler yüklenemedi: {e}")
    scaler = None

if tf is not None:
    try:
        model = tf.keras.models.load_model(MODEL_PATH)
        print("✅ Model yüklendi.")
    except Exception as e:
        print(f"⚠️ Model yüklenemedi (scorecard ile devam): {e}")
        model = None
else:
    print("⚠️ TensorFlow yok (scorecard ile devam).")

# =========================================================
# 2) Helpers
# =========================================================
def safe_float(v, default=0.0):
    if v is None:
        return float(default)
    try:
        if isinstance(v, str) and v.strip() == "":
            return float(default)
        return float(v)
    except Exception:
        return float(default)

def clamp(x, lo, hi):
    return float(max(lo, min(hi, x)))

def first_present(data: dict, keys: list, default=None):
    """Birden fazla key'e tolerans: ilk bulunanı alır."""
    for k in keys:
        if k in data and data.get(k) is not None:
            return data.get(k)
    return default

def add_unique(lst, txt):
    if txt and txt not in lst:
        lst.append(txt)

def pick_band(p_approval: float) -> str:
    if p_approval >= CFG["APPROVE_TH"]:
        return "ONAY"
    if p_approval >= CFG["REVIEW_TH"]:
        return "INCELEME"
    return "RED"

def credit_score_from_approval(p_approval: float) -> int:
    # 300..1900
    p = clamp(p_approval, 0.0, 1.0)
    return int(round(300 + p * 1600))

def score_to_approval(score_0_100: float) -> float:
    return clamp(score_0_100 / 100.0, 0.0, 1.0)

# =========================================================
# 3) Derived metrics (daha dengeli)
# =========================================================
def compute_metrics(aylik_gelir, toplam_borc, kredi_limiti):
    limit_base = max(kredi_limiti, CFG["LIMIT_BASE"])
    util = (toplam_borc / limit_base) if limit_base > 0 else 0.0
    dti = (toplam_borc / aylik_gelir) if aylik_gelir > 0 else 0.0

    # uç değerleri kırp → borç/limit her şeyi uçurmasın
    util = clamp(util, 0.0, 2.0)
    dti = clamp(dti, 0.0, 2.0)
    return util, dti, limit_base

# =========================================================
# 4) SCORECARD (gelir/kıdem/eğitim/varlık daha etkili)
#    Toplam 100 puan
# =========================================================
def compute_scorecard(
    yas, egitim, is_kidemi,
    aylik_gelir, gelir_istikrari,
    toplam_borc, kredi_limiti,
    gecikme, odeme_orani,
    ev_degeri, arac_degeri,
    ev_adeti, arac_adeti
):
    reasons, positives = [], []
    util, dti, limit_base = compute_metrics(aylik_gelir, toplam_borc, kredi_limiti)

    # varlık gücü (değer + adet birlikte)
    assets_total = max(0.0, ev_degeri) + max(0.0, arac_degeri)
    annual_income = max(aylik_gelir * 12.0, 1.0)
    asset_strength = assets_total / annual_income  # varlık / yıllık gelir

    # adet bonusu (maks 6 puan)
    count_bonus = 0.0
    if ev_adeti >= 1: count_bonus += 2.0
    if ev_adeti >= 2: count_bonus += 1.0
    if arac_adeti >= 1: count_bonus += 2.0
    if arac_adeti >= 2: count_bonus += 1.0
    count_bonus = clamp(count_bonus, 0.0, 6.0)

    score = 0.0

    # 1) GECIKME (0..25) — hala önemli
    if gecikme <= 0:
        score += 25
        add_unique(positives, "Ödeme geçmişi temiz (gecikme yok).")
    elif gecikme == 1:
        score += 12
        add_unique(reasons, "Son 12 ay içinde 1 gecikme var.")
    else:
        score += 0
        add_unique(reasons, f"Son 12 ay gecikme sayısı yüksek ({int(gecikme)}).")

    # 2) BORÇ/GELİR (0..15)
    if aylik_gelir <= 0:
        add_unique(reasons, "Aylık gelir bilgisi eksik/0.")
    else:
        if dti <= 0.25:
            score += 15
            add_unique(positives, "Borç/Gelir oranı çok iyi.")
        elif dti <= 0.45:
            score += 10
            add_unique(positives, "Borç/Gelir oranı iyi.")
        elif dti <= CFG["DTI_WARN"]:
            score += 6
            add_unique(reasons, "Borç/Gelir oranı yükselmiş.")
        elif dti <= CFG["DTI_HARD"]:
            score += 2
            add_unique(reasons, "Borç/Gelir oranı kritik.")
        else:
            score += 0
            add_unique(reasons, "Borç/Gelir oranı aşırı yüksek.")

    # 3) LIMIT DOLULUK (0..12) — eskiye göre biraz daha az baskın
    if kredi_limiti <= 0:
        add_unique(reasons, "Kredi limiti eksik/0.")
    else:
        if util <= 0.25:
            score += 12
            add_unique(positives, "Limit kullanımı ideal.")
        elif util <= 0.55:
            score += 8
            add_unique(positives, "Limit kullanımı dengeli.")
        elif util <= CFG["UTIL_WARN"]:
            score += 4
            add_unique(reasons, "Limit doluluk yükselmiş.")
        elif util <= CFG["UTIL_HARD"]:
            score += 1
            add_unique(reasons, "Limit doluluk çok yüksek.")
        else:
            score += 0
            add_unique(reasons, "Limit neredeyse tamamen dolu.")

    # 4) GELİR + İSTİKRAR (0..22) — etkisini artırdım
    # gelir (0..16)
    if aylik_gelir < CFG["INCOME_LOW"]:
        score += 4
        add_unique(reasons, "Aylık gelir düşük segmentte.")
    elif aylik_gelir < CFG["INCOME_GOOD"]:
        score += 9
        add_unique(positives, "Aylık gelir orta segmentte.")
    elif aylik_gelir < CFG["INCOME_VERY_GOOD"]:
        score += 13
        add_unique(positives, "Aylık gelir iyi segmentte.")
    else:
        score += 16
        add_unique(positives, "Aylık gelir üst segmentte.")

    # istikrar (0..6)
    if int(gelir_istikrari) == 1:
        score += 6
        add_unique(positives, "Gelir istikrarı güçlü.")
    else:
        add_unique(reasons, "Gelir istikrarı zayıf/işaretlenmemiş.")

    # 5) İŞ KIDEMİ (0..12)
    if is_kidemi < 1:
        score += 3
        add_unique(reasons, "İş kıdemi çok düşük.")
    elif is_kidemi < 3:
        score += 7
        add_unique(positives, "İş kıdemi gelişiyor.")
    elif is_kidemi < 7:
        score += 10
        add_unique(positives, "İş kıdemi iyi.")
    else:
        score += 12
        add_unique(positives, "İş kıdemi çok güçlü.")

    # 6) EĞİTİM (0..8)
    # 0:ilkokul 1:lise 2:üni 3:yl 4:doktora varsayımı
    if egitim <= 1:
        score += 2
        add_unique(reasons, "Eğitim seviyesi düşük segmentte.")
    elif egitim == 2:
        score += 5
        add_unique(positives, "Eğitim seviyesi yeterli.")
    elif egitim == 3:
        score += 7
        add_unique(positives, "Eğitim seviyesi güçlü.")
    else:
        score += 8
        add_unique(positives, "Eğitim seviyesi çok güçlü.")

    # 7) ÖDEME ORANI (0..9)
    if odeme_orani <= 0:
        add_unique(reasons, "Ödeme oranı bilgisi eksik/0.")
    elif odeme_orani < CFG["PAYMENT_RATE_LOW"]:
        score += 2
        add_unique(reasons, "Ödeme oranı düşük.")
    elif odeme_orani < CFG["PAYMENT_RATE_GOOD"]:
        score += 6
        add_unique(positives, "Ödeme oranı orta-iyi.")
    else:
        score += 9
        add_unique(positives, "Ödeme oranı çok iyi.")

    # 8) VARLIK (0..7) + ADET BONUS (0..6)
    if assets_total <= 0:
        score += 1
        add_unique(reasons, "Kayıtlı varlık bulunmuyor.")
    else:
        if asset_strength >= 2.0:
            score += 7
            add_unique(positives, "Varlık gücü çok yüksek.")
        elif asset_strength >= 1.0:
            score += 5
            add_unique(positives, "Varlık gücü iyi.")
        else:
            score += 3
            add_unique(positives, "Varlık mevcut (etkisi sınırlı).")

        # adet bonusu
        score += count_bonus
        if count_bonus > 0:
            add_unique(positives, "Varlık adedi puana pozitif katkı sağladı.")

    score = clamp(score, 0.0, 100.0)

    computed = {
        "limit_doluluk": float(util),
        "borc_gelir": float(dti),
        "limit_base": float(limit_base),
        "assets_total": float(assets_total),
        "varlik_gucu": float(asset_strength),
        "ev_adeti": float(ev_adeti),
        "arac_adeti": float(arac_adeti),
        "scorecard_score_0_100": float(score),
    }

    # boş kalmasın
    if not reasons:
        reasons = ["Belirgin negatif sinyal yok."]
    if not positives:
        positives = ["Belirgin pozitif sinyal yok."]

    return score, reasons, positives, computed

# =========================================================
# 5) HARD REJECT (çok sert durumlar)
# =========================================================
def hard_reject_rules(yas, gecikme, dti, util, aylik_gelir, kredi_limiti, odeme_orani):
    hard = []
    if yas < CFG["AGE_MIN"]:
        hard.append("18 yaş altı (kesin red).")
    if gecikme >= CFG["DELAY_HARD"]:
        hard.append("Gecikme sayısı yüksek (kesin red).")
    if dti > CFG["DTI_HARD"]:
        hard.append("Borç/Gelir çok yüksek (kesin red).")
    if util > CFG["UTIL_HARD"]:
        hard.append("Limit doluluk çok yüksek (kesin red).")
    if aylik_gelir <= 0:
        hard.append("Aylık gelir 0/eksik (değerlendirilemez).")
    if kredi_limiti <= 0:
        hard.append("Kredi limiti 0/eksik (değerlendirilemez).")
    if odeme_orani > 0 and odeme_orani < 20:
        hard.append("Ödeme oranı aşırı düşük (kesin red).")
    return hard

# =========================================================
# 6) HEALTH
# =========================================================
@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "model_loaded": bool(model is not None),
        "scaler_loaded": bool(scaler is not None),
        "config": {
            "APPROVE_TH": CFG["APPROVE_TH"],
            "REVIEW_TH": CFG["REVIEW_TH"],
            "BLEND_ALPHA": CFG["BLEND_ALPHA"],
            "DTI_WARN": CFG["DTI_WARN"],
            "DTI_HARD": CFG["DTI_HARD"],
            "UTIL_WARN": CFG["UTIL_WARN"],
            "UTIL_HARD": CFG["UTIL_HARD"],
            "LIMIT_BASE": CFG["LIMIT_BASE"],
        }
    })

# =========================================================
# 7) PREDICT
# =========================================================
@app.post("/predict")
def predict():
    try:
        data = request.json or {}

        # ---- input (çok toleranslı key okuma) ----
        yas = safe_float(first_present(data, ["yas", "age"], 0))
        cinsiyet = safe_float(first_present(data, ["cinsiyet", "gender"], 0))
        egitim = safe_float(first_present(data, ["egitim", "egitimSeviyesi", "education"], 0))
        is_kidemi = safe_float(first_present(data, ["is_kidemi", "isKidemi", "tenure"], 0))
        aylik_gelir = safe_float(first_present(data, ["aylik_gelir", "aylikGelir", "income"], 0))
        gelir_istikrari = safe_float(first_present(data, ["gelir_istikrari", "gelirIstikrari"], 0))

        kredi_limiti = safe_float(first_present(data, ["kredi_limiti", "krediLimiti"], 0))
        toplam_borc = safe_float(first_present(data, ["borc", "toplam_borc", "toplamBorc"], 0))

        gecikme = safe_float(first_present(data, ["gecikme", "gecikme_sayisi", "gecikmeSayisi"], 0))

        # ev/araba değerleri
        ev_degeri = safe_float(first_present(data, ["ev_durumu", "ev_degeri", "evDegeri"], 0))
        arac_degeri = safe_float(first_present(data, ["arac_durumu", "arac_degeri", "aracDegeri"], 0))

        # adetleri de destekle (senin isteğin!)
        ev_adeti = safe_float(first_present(data, ["ev_adeti", "evAdeti"], 0))
        arac_adeti = safe_float(first_present(data, ["arac_adeti", "aracAdeti"], 0))

        # ödeme oranı: direkt gelirse kullan, gelmezse harcama/ödeme ile hesapla
        odeme_orani = safe_float(first_present(data, ["odeme_orani", "odemeOrani"], 0))

        harcama = safe_float(first_present(data, ["kredi_karti_harcamasi", "krediKartiHarcamasi"], 0))
        odeme = safe_float(first_present(data, ["kredi_karti_odeme", "krediKartiOdeme"], 0))
        if odeme_orani <= 0 and harcama > 0:
            odeme_orani = clamp((odeme / max(harcama, 1.0)) * 100.0, 0.0, 150.0)

        # derived metrics
        util, dti, limit_base = compute_metrics(aylik_gelir, toplam_borc, kredi_limiti)

        # ---- SCORECARD ----
        score_0_100, reasons, positives, computed = compute_scorecard(
            yas=yas, egitim=egitim, is_kidemi=is_kidemi,
            aylik_gelir=aylik_gelir, gelir_istikrari=gelir_istikrari,
            toplam_borc=toplam_borc, kredi_limiti=kredi_limiti,
            gecikme=gecikme, odeme_orani=odeme_orani,
            ev_degeri=ev_degeri, arac_degeri=arac_degeri,
            ev_adeti=ev_adeti, arac_adeti=arac_adeti
        )
        sc_approval = score_to_approval(score_0_100)

        # ---- HARD REJECT ----
        hard = hard_reject_rules(
            yas=yas, gecikme=gecikme, dti=dti, util=util,
            aylik_gelir=aylik_gelir, kredi_limiti=kredi_limiti, odeme_orani=odeme_orani
        )

        decision = {
            "hard_reject": bool(len(hard) > 0),
            "hard_reject_rules": hard,
            "computed": {
                "yas": yas,
                "aylik_gelir": aylik_gelir,
                "toplam_borc": toplam_borc,
                "kredi_limiti": kredi_limiti,
                "limit_base": float(limit_base),
                "gecikme": gecikme,
                "odeme_orani": odeme_orani,
                "limit_doluluk": float(util),
                "borc_gelir": float(dti),
                **computed
            },
            "thresholds": {
                "APPROVE_TH": CFG["APPROVE_TH"],
                "REVIEW_TH": CFG["REVIEW_TH"],
                "DTI_WARN": CFG["DTI_WARN"],
                "DTI_HARD": CFG["DTI_HARD"],
                "UTIL_WARN": CFG["UTIL_WARN"],
                "UTIL_HARD": CFG["UTIL_HARD"],
                "LIMIT_BASE": CFG["LIMIT_BASE"],
            }
        }

        # ---- HARD REJECT çıktı ----
        if decision["hard_reject"]:
            # burada sabit puan vermiyoruz; yine de scorecard’ı raporluyoruz ama final RED
            final_approval = 0.10
            band = "RED"
            prediction = 1

            for r in hard:
                add_unique(reasons, r)

            decision.update({
                "model_used": False,
                "scorecard_used": True,
                "scorecard_score_0_100": float(score_0_100),
                "scorecard_approval_prob": float(sc_approval),
                "final_approval_prob": float(final_approval),
                "final_band": band,
                "model_reason": "Kural motoru devreye girdi (hard stop)."
            })

            return jsonify({
                "prediction": int(prediction),
                "status": band,
                "approval_probability": float(final_approval),
                "risk_probability": float(1.0 - final_approval),
                "score": int(credit_score_from_approval(final_approval)),
                "reasons": reasons[:12],
                "positives": positives[:12],
                "decision": decision
            })

        # ---- MODEL (varsa) ----
        model_used = False
        model_approval = None

        if model is not None and scaler is not None:
            # Modelin/scaler'ın bozulmaması için feature sırası ESKİSİYLE aynı
            ev_sahipligi = 1.0 if ev_degeri > 0 else 0.0
            arac_sahipligi = 1.0 if arac_degeri > 0 else 0.0

            features = [
                yas,
                cinsiyet,
                egitim,
                aylik_gelir,
                gelir_istikrari,
                is_kidemi,
                ev_sahipligi,
                ev_degeri,
                arac_sahipligi,
                arac_degeri,
                kredi_limiti,
                util,
                toplam_borc,
                dti,
                gecikme,
                odeme_orani
            ]

            arr = np.array([features], dtype=np.float32)
            scaled = scaler.transform(arr)
            pred = model.predict(scaled, verbose=0)

            # Varsayım: çıktı ONAY olasılığı (0..1)
            model_approval = clamp(float(pred[0][0]), 0.0, 1.0)
            model_used = True

        # ---- BLEND: model + scorecard ----
        if model_used and model_approval is not None:
            alpha = clamp(CFG["BLEND_ALPHA"], 0.0, 1.0)
            final_approval = alpha * model_approval + (1.0 - alpha) * sc_approval
            decision["model_used"] = True
            decision["scorecard_used"] = True
            decision["model_approval_prob"] = float(model_approval)
            decision["scorecard_approval_prob"] = float(sc_approval)
            decision["scorecard_score_0_100"] = float(score_0_100)
            decision["model_reason"] = (
                f"Model %{model_approval*100:.1f} + Scorecard %{sc_approval*100:.1f} "
                f"(alpha={alpha:.2f}) harmanlandı."
            )
        else:
            final_approval = sc_approval
            decision["model_used"] = False
            decision["scorecard_used"] = True
            decision["scorecard_approval_prob"] = float(sc_approval)
            decision["scorecard_score_0_100"] = float(score_0_100)
            decision["model_reason"] = "Model yok → sadece scorecard ile karar verildi."

        final_approval = clamp(final_approval, 0.0, 1.0)

        # ---- band + prediction ----
        band = pick_band(final_approval)
        prediction = 0 if band == "ONAY" else 1  # UI uyumu (ONAY=0)

        # ekstra açıklamalar (warn)
        if dti > CFG["DTI_WARN"]:
            add_unique(reasons, f"Borç/Gelir oranı yüksek (≈ %{int(dti*100)}).")
        if util > CFG["UTIL_WARN"]:
            add_unique(reasons, f"Limit doluluk yüksek (≈ %{int(util*100)}).")

        decision["final_approval_prob"] = float(final_approval)
        decision["final_band"] = band

        return jsonify({
            "prediction": int(prediction),
            "status": band,  # ONAY/INCELEME/RED
            "approval_probability": float(final_approval),
            "risk_probability": float(1.0 - final_approval),
            "score": int(credit_score_from_approval(final_approval)),
            "reasons": reasons[:12],
            "positives": positives[:12],
            "decision": decision
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    print("🚀 PYTHON SUNUCUSU ÇALIŞIYOR (PORT: 5000)...")
    app.run(debug=True, port=5000)

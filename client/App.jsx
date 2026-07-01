import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import {
  MdDarkMode,
  MdLightMode,
  MdTouchApp,
  MdClose,
  MdPerson,
  MdWork,
  MdSchool,
  MdAttachMoney,
  MdHome,
  MdDirectionsCar,
  MdCreditCard,
  MdAccountBalanceWallet,
  MdWarning,
  MdKeyboardArrowUp,
  MdPercent,
  MdExpandMore,
  MdCheckCircle,
  MdTrendingUp,
  MdNfc,
  MdCancel,
  MdOutlineRealEstateAgent,
  MdOutlineDirectionsCarFilled,
} from "react-icons/md";

function App() {
  // --- TEMA YÖNETİMİ ---
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  // --- PREMIUM FX STATE ---
  const [decisionFx, setDecisionFx] = useState(null); // "approved" | "rejected" | null
  const [masterGlitch, setMasterGlitch] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 350);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // --- FORM VERİLERİ (STATE) ---
  const [formData, setFormData] = useState({
    yas: "30",
    cinsiyet: "E",
    egitimSeviyesi: 3,
    isKidemi: "5",
    aylikGelir: "35000",
    gelirIstikrari: true,
    evAdeti: "1",
    evDegeri: "1500000",
    aracAdeti: "1",
    aracDegeri: "500000",
    toplamBorc: "20000",
    krediLimiti: "100000",
    gecikmeSon12Ay: "0",
    ortOdemeOrani: "90",
  });

  // --- SONUÇ VE ANİMASYON STATE'LERİ ---
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState(null); // API Sonucu

  // 3D Tilt (Eğme) Efekti için
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const resultSectionRef = useRef(null);

  // Skor Sayacı için
  const [displayScore, setDisplayScore] = useState(0);

  // --- YAŞ ÇARKI (KNOB) MODAL İÇİN ---
  const [showAgeModal, setShowAgeModal] = useState(false);
  const knobRef = useRef(null);
  const [knobAngle, setKnobAngle] = useState(0);

  const openAgeModal = () => {
    setShowAgeModal(true);
    const currentAge = parseInt(formData.yas) || 18;
    const angle = ((currentAge - 18) / (90 - 18)) * 360;
    setKnobAngle(angle);
  };

  const handleKnobMove = (e) => {
    if (!knobRef.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = knobRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    angle += 90;
    if (angle < 0) angle += 360;
    setKnobAngle(angle);
    const age = Math.round((angle / 360) * (90 - 18) + 18);
    setFormData((prev) => ({ ...prev, yas: age }));
  };

  const handleManualAgeChange = (e) => {
    let val = e.target.value;
    if (val === "") {
      setFormData((prev) => ({ ...prev, yas: "" }));
      return;
    }
    val = parseInt(val);
    setFormData((prev) => ({ ...prev, yas: val }));
    let newAngle = ((val - 18) / 72) * 360;
    if (newAngle < 0) newAngle = 0;
    if (newAngle > 360) newAngle = 360;
    setKnobAngle(newAngle);
  };

  // --- HESAPLAMALAR (GAUGE GRAFİKLERİ İÇİN) ---
  const limitDolulukOrani = useMemo(() => {
    if (!formData.toplamBorc || !formData.krediLimiti) return 0;
    const oran =
      (parseFloat(formData.toplamBorc) / parseFloat(formData.krediLimiti)) *
      100;
    return Math.min(Math.max(oran, 0), 100).toFixed(0);
  }, [formData.toplamBorc, formData.krediLimiti]);

  const borcGelirOrani = useMemo(() => {
    if (!formData.toplamBorc || !formData.aylikGelir) return 0;
    const oran =
      (parseFloat(formData.toplamBorc) / parseFloat(formData.aylikGelir)) * 100;
    return Math.min(Math.max(oran, 0), 100).toFixed(0);
  }, [formData.toplamBorc, formData.aylikGelir]);

  // --- 3D KART HAREKET MANTIĞI ---
  const handleCardMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();

    // Mouse'un kart içindeki konumu
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Dönüş açısı hesaplama (Hassasiyeti 20 ile ayarlıyoruz)
    const rotateX = ((y - centerY) / 20) * -1; // Yukarı bakması için ters çevir
    const rotateY = (x - centerX) / 20;

    setTilt({ x: rotateX, y: rotateY });
  };

  const handleCardLeave = () => {
    setTilt({ x: 0, y: 0 }); // Mouse çıkınca kartı düzelt
  };

  // --- SKOR ANİMASYONU ---
  useEffect(() => {
    if (resultData && resultData.score) {
      let start = 0;
      const end = resultData.score;
      const duration = 2000; // 2 saniye sürsün
      const startTime = performance.now();

      const animateScore = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out efekti (yavaşça durma)
        const ease = 1 - Math.pow(1 - progress, 3);

        setDisplayScore(Math.floor(start + (end - start) * ease));

        if (progress < 1) {
          requestAnimationFrame(animateScore);
        }
      };
      requestAnimationFrame(animateScore);
    }
  }, [resultData]);

  // --- NEDEN (fallback) ---
  // API positives/reasons dönmezse, form verisinden modern bir açıklama üretir.
  const fallbackReasons = useMemo(() => {
    const positives = [];
    const negatives = [];

    const yas = Number(formData.yas) || 0;
    const gelir = Number(formData.aylikGelir) || 0;
    const kidem = Number(formData.isKidemi) || 0;
    const gecikme =
      Number(formData.gecikmeSon12Ay ?? formData.gecikmeSayisi) || 0;
    const odeme = Number(formData.ortOdemeOrani) || 0;
    const limit = Number(formData.krediLimiti) || 0;
    const borc = Number(formData.toplamBorc) || 0;

    // Pozitifler
    if (yas >= 25 && yas <= 55)
      positives.push("Yaş profili risk açısından dengeli");
    if (gelir >= 30000) positives.push("Aylık gelir seviyesi güçlü");
    if (kidem >= 3) positives.push("İş kıdemi istikrar gösteriyor");
    if (odeme >= 80) positives.push("Ödeme oranı yüksek");
    if (gecikme === 0 && yas > 0) positives.push("Son 12 ay gecikme yok");
    if (limit >= 50000) positives.push("Kredi limiti kapasitesi iyi");

    // Negatifler
    if (yas > 0 && yas < 21)
      negatives.push("Yaş profili yüksek risk grubuna yakın");
    if (gelir > 0 && gelir < 15000)
      negatives.push("Aylık gelir seviyesi düşük");
    if (kidem > 0 && kidem < 1)
      negatives.push("İş kıdemi düşük (istikrar zayıf)");
    if (gecikme >= 2) negatives.push("Son 12 ay gecikme sayısı yüksek");
    if (odeme > 0 && odeme < 50) negatives.push("Ödeme oranı düşük");

    // Borç/limit analizleri (limit 0 ise bölme yapma)
    if (borc > 0 && limit > 0) {
      const util = borc / limit;
      if (util > 1.2) negatives.push("Borç/limit oranı yüksek");
      if (limit - borc < 5000) negatives.push("Kullanılabilir limit düşük");
    }

    return { positives, negatives };
  }, [formData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCustomChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- BACKEND BAĞLANTISI ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResultData(null);

    const toInt = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : 0;
    };

    const toFloat = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    // TL gibi "1.000.000" formatlarını doğru çevirir
    const toMoney = (v) => {
      const s = String(v ?? "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".")
        .replace(/[^\d.]/g, "");
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };

    const evAdetiNum = toInt(formData.evAdeti);
    const aracAdetiNum = toInt(formData.aracAdeti);

    const requestData = {
      yas: toInt(formData.yas),
      cinsiyet: formData.cinsiyet === "E" ? 1 : 0,
      egitim: toInt(formData.egitimSeviyesi),
      is_kidemi: toInt(formData.isKidemi),
      aylik_gelir: toFloat(formData.aylikGelir),
      gelir_istikrari: formData.gelirIstikrari ? 1 : 0,

      ev_adeti: evAdetiNum,
      arac_adeti: aracAdetiNum,

      ev_durumu: evAdetiNum > 0 ? toMoney(formData.evDegeri) : 0,
      arac_durumu: aracAdetiNum > 0 ? toMoney(formData.aracDegeri) : 0,

      borc: toFloat(formData.toplamBorc),
      kredi_limiti: toFloat(formData.krediLimiti),

      gecikme: toInt(formData.gecikmeSon12Ay ?? formData.gecikmeSayisi),
      odeme_orani: toFloat(formData.ortOdemeOrani),
    };

    console.log("REQ", requestData);
    console.log(
      "arac_adeti / arac_durumu:",
      requestData.arac_adeti,
      requestData.arac_durumu
    );
    console.log(
      "ev_adeti / ev_durumu:",
      requestData.ev_adeti,
      requestData.ev_durumu
    );

    try {
      const response = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      // ✅ JSON'u güvenli oku
      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      // ✅ ok değilse anlamlı hata fırlat
      if (!response.ok) {
        const msg = result?.error || "Sunucu hatası!";
        throw new Error(msg);
      }

      console.log("RESP status/score:", result?.status, result?.score);
      console.log("model_used:", result?.decision?.model_used);
      console.log(
        "scorecard:",
        result?.decision?.computed?.scorecard_score_0_100
      );
      console.log(
        "dti/util:",
        result?.decision?.computed?.borc_gelir,
        result?.decision?.computed?.limit_doluluk
      );
      console.log("assets_total:", result?.decision?.computed?.assets_total);

      // Yükleme animasyonu için biraz bekle
      setTimeout(() => {
        setResultData(result);
        setIsLoading(false);

        // ✅ Onay/Red anında ekran flash + glitch (premium)
        const approved = Number(result?.prediction) === 0;

        // Bu state'ler sende tanımlı olmalı:
        // const [decisionFx, setDecisionFx] = useState(null);
        // const [masterGlitch, setMasterGlitch] = useState(false);
        // const resultSectionRef = useRef(null);

        setDecisionFx(approved ? "approved" : "rejected");
        setMasterGlitch(true);
        setTimeout(() => setMasterGlitch(false), 150);
        setTimeout(() => setDecisionFx(null), 650);

        // Sonuç gelince sayfayı aşağı kaydır
        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 100);
      }, 1500);
    } catch (error) {
      console.error("Hata:", error);
      setIsLoading(false);
      alert("Sunucuya bağlanılamadı! Python kodunun çalıştığından emin olun.");
    }
  };

  // --- NETWORK GENERATOR (Görsel Efektler) ---
  const generateNetworkData = (width) => {
    const VIEWBOX_HEIGHT = 500;
    const paddingTop = 60;
    const paddingBottom = 60;
    const totalHeight = VIEWBOX_HEIGHT - paddingTop - paddingBottom;
    const NODE_COUNT = 7;
    const startNodes = [];
    const endNodes = [];
    const lines = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const yPos = paddingTop + (totalHeight / (NODE_COUNT - 1)) * i;
      const percent = (yPos / VIEWBOX_HEIGHT) * 100 + "%";
      let colorClass = "node-purple";
      if (i < 2) colorClass = "node-blue";
      else if (i >= 5) colorClass = "node-pink";
      startNodes.push({
        id: i,
        y: yPos,
        percent: percent,
        colorClass: colorClass,
      });
      endNodes.push({
        id: i,
        y: yPos,
        percent: percent,
        colorClass: colorClass,
      });
    }
    let lineIdCounter = 0;
    startNodes.forEach((startNode) => {
      const possibleTargets = [...endNodes].sort(() => 0.5 - Math.random());
      const selectedTargets = possibleTargets.slice(0, 6);
      selectedTargets.forEach((endNode) => {
        lines.push({
          id: lineIdCounter++,
          path: `M 0,${startNode.y} L ${width},${endNode.y}`,
          duration: 2 + Math.random() * 3 + "s",
          delay: Math.random() * 2 + "s",
          opacity: 0.3 + Math.random() * 0.4,
        });
      });
    });
    return { startNodes, endNodes, lines };
  };

  const leftBridge = useMemo(() => generateNetworkData(400), []);
  const rightBridge = useMemo(() => generateNetworkData(400), []);

  // --- RENDER ---
  return (
    <div className="app-container">
      <div className="corner-glow glow-top-left"></div>
      <div className="corner-glow glow-top-right"></div>
      <div className="bg-glow bg-glow-blue"></div>
      <div className="bg-glow bg-glow-purple"></div>

      {/* --- ONAY/RED FX OVERLAY --- */}
      {decisionFx && (
        <div className={`decision-fx-overlay ${decisionFx}`}></div>
      )}

      {/* --- SCROLL TO TOP --- */}
      {showTopBtn && (
        <button
          type="button"
          className="scroll-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Yukarı çık"
          title="Yukarı çık"
        >
          <MdKeyboardArrowUp size={26} />
        </button>
      )}

      {/* --- YAŞ MODAL --- */}
      {showAgeModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-effect">
            <button
              className="modal-close-btn"
              onClick={() => setShowAgeModal(false)}
            >
              <MdClose />
            </button>
            <h3>YAŞ AYARI</h3>
            <div
              className="knob-wrapper"
              onMouseMove={(e) => e.buttons === 1 && handleKnobMove(e)}
              onTouchMove={handleKnobMove}
              ref={knobRef}
            >
              <div
                className="knob-circle"
                style={{ transform: `rotate(${knobAngle}deg)` }}
              >
                <div className="knob-handle"></div>
              </div>
              <div className="knob-value">
                <input
                  type="number"
                  className="knob-input"
                  value={formData.yas}
                  onChange={handleManualAgeChange}
                  placeholder="18"
                />
                <span>YAŞ</span>
              </div>
            </div>
            <p className="modal-hint">Çevirmek için sürükle</p>
            <button
              className="neon-button small-btn"
              onClick={() => setShowAgeModal(false)}
            >
              TAMAM
            </button>
          </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="app-header">
        <h1>KREDİ ONAY TAHİMİ</h1>
        <h2>Yapay Sinir Ağı </h2>
        <button className="theme-toggle-btn" onClick={toggleTheme}>
          {theme === "dark" ? <MdLightMode /> : <MdDarkMode />}
        </button>
      </header>

      {/* --- MAIN FORM --- */}
      <form onSubmit={handleSubmit} className="main-form">
        <div className="grid-layout">
          {/* SOL KART */}
          <div className="neon-card card-blue">
            <div className="desktop-only">
              {leftBridge.startNodes.map((node) => (
                <div
                  key={`l-start-${node.id}`}
                  className={`connection-node node-right-edge ${node.colorClass}`}
                  style={{ top: node.percent }}
                ></div>
              ))}
            </div>
            <h3 className="card-title">Kişisel & İş</h3>
            <div className="card-content">
              <div className="input-group input-with-icon">
                <MdPerson className="input-icon" />
                <input
                  type="number"
                  name="yas"
                  value={formData.yas}
                  onChange={handleChange}
                  placeholder=" "
                />
                <label>Yaş</label>
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={openAgeModal}
                >
                  <MdTouchApp />
                </button>
                <span className="focus-border"></span>
              </div>
              <div
                className="input-group"
                style={{ flexDirection: "column", alignItems: "stretch" }}
              >
                <label
                  style={{
                    position: "static",
                    marginBottom: "0.5rem",
                    fontSize: "0.9rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Cinsiyet
                </label>
                <div className="custom-toggle-container">
                  <div
                    className={`toggle-slider ${
                      formData.cinsiyet === "K" ? "slide-left" : "slide-right"
                    }`}
                  ></div>
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => handleCustomChange("cinsiyet", "K")}
                  >
                    Kadın
                  </button>
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => handleCustomChange("cinsiyet", "E")}
                  >
                    Erkek
                  </button>
                </div>
              </div>
              <div
                className="input-group"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  marginTop: "1rem",
                }}
              >
                <label
                  style={{
                    position: "static",
                    marginBottom: "0.5rem",
                    fontSize: "0.9rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <MdSchool style={{ marginRight: "5px" }} /> Eğitim Seviyesi
                </label>
                <div className="education-stepper">
                  <div
                    className="stepper-highlight"
                    style={{
                      transform: `translateX(${
                        (formData.egitimSeviyesi - 1) * 100
                      }%)`,
                    }}
                  ></div>
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`step-btn ${
                        formData.egitimSeviyesi === level ? "active" : ""
                      }`}
                      onClick={() =>
                        handleCustomChange("egitimSeviyesi", level)
                      }
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="slider-steps text-steps">
                  <span>Lise</span>
                  <span>Lisans</span>
                  <span>Y.Lisans</span>
                  <span>Doktora</span>
                </div>
              </div>
              <div className="input-group input-with-icon modern-select-group">
                <MdWork className="input-icon" />
                <select
                  name="isKidemi"
                  value={formData.isKidemi}
                  onChange={handleChange}
                  required
                  className="modern-select"
                >
                  <option value="" disabled hidden></option>
                  {Array.from({ length: 41 }, (_, i) => (
                    <option key={i} value={i}>
                      {i} Yıl
                    </option>
                  ))}
                  <option value={41}>40+ Yıl</option>
                </select>
                <label>İş Kıdemi</label>
                <MdExpandMore className="select-arrow-icon" />
                <span className="focus-border"></span>
              </div>
            </div>
          </div>

          {/* SOL KÖPRÜ */}
          <div className="neural-connection-bridge desktop-only">
            <svg
              className="neural-svg-bridge"
              viewBox="0 0 400 500"
              preserveAspectRatio="none"
            >
              <g>
                {leftBridge.lines.map((item) => (
                  <path
                    key={item.id}
                    d={item.path}
                    className="neural-line blue"
                    style={{ opacity: item.opacity }}
                  />
                ))}
              </g>
            </svg>
            <div className="dots-container">
              {leftBridge.lines.map((item) => (
                <div
                  key={`dot-${item.id}`}
                  className="data-light light-blue"
                  style={{
                    offsetPath: `path('${item.path}')`,
                    animationDuration: item.duration,
                    animationDelay: item.delay,
                  }}
                ></div>
              ))}
            </div>
          </div>

          {/* ORTA KART */}
          <div className="neon-card card-purple">
            <div className="desktop-only">
              {leftBridge.endNodes.map((node) => (
                <div
                  key={`l-end-${node.id}`}
                  className={`connection-node node-left-edge ${node.colorClass}`}
                  style={{ top: node.percent }}
                ></div>
              ))}
              {rightBridge.startNodes.map((node) => (
                <div
                  key={`r-start-${node.id}`}
                  className={`connection-node node-right-edge ${node.colorClass}`}
                  style={{ top: node.percent }}
                ></div>
              ))}
            </div>
            <h3 className="card-title">Gelir & Varlıklar</h3>
            <div className="card-content">
              <div className="input-group input-with-icon input-with-suffix">
                <MdAttachMoney className="input-icon" />
                <input
                  type="number"
                  name="aylikGelir"
                  value={formData.aylikGelir}
                  onChange={handleChange}
                  placeholder=" "
                />
                <label>Aylık Gelir</label>
                <span className="suffix">TL</span>
                <span className="focus-border"></span>
              </div>
              <div
                className={`modern-toggle ${
                  formData.gelirIstikrari ? "active" : ""
                }`}
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    gelirIstikrari: !prev.gelirIstikrari,
                  }))
                }
              >
                <span className="toggle-label">
                  <MdWarning /> Gelir İstikrarı
                </span>
                <div className="toggle-switch">
                  <div className="toggle-knob" />
                </div>
              </div>
              <div className="grid-2-col" style={{ marginTop: "1rem" }}>
                <div className="input-group input-with-icon modern-select-group">
                  <MdHome className="input-icon" />
                  <select
                    name="evAdeti"
                    value={formData.evAdeti}
                    onChange={handleChange}
                    required
                    className="modern-select"
                  >
                    <option value="" disabled hidden></option>
                    <option value="0">Yok</option>
                    <option value="1">1 Adet</option>
                    <option value="2">2 Adet</option>
                    <option value="3">3 Adet</option>
                    <option value="4">4 Adet</option>
                    <option value="5">5+ Adet</option>
                  </select>
                  <label>Ev Adeti</label>
                  <MdExpandMore className="select-arrow-icon" />
                  <span className="focus-border"></span>
                </div>

                {parseInt(formData.evAdeti) > 0 && (
                  <div
                    className="input-group input-with-icon input-with-suffix"
                    style={{ animation: "fadeIn 0.5s" }}
                  >
                    {/* ✅ Para yerine gayrimenkul ikonu */}
                    <MdOutlineRealEstateAgent className="input-icon" />
                    <input
                      type="number"
                      name="evDegeri"
                      value={formData.evDegeri}
                      onChange={handleChange}
                      placeholder=" "
                    />
                    <label>Ev Değeri</label>
                    <span className="suffix">TL</span>
                    <span className="focus-border"></span>
                  </div>
                )}
              </div>

              <div className="grid-2-col">
                <div className="input-group input-with-icon modern-select-group">
                  <MdDirectionsCar className="input-icon" />
                  <select
                    name="aracAdeti"
                    value={formData.aracAdeti}
                    onChange={handleChange}
                    required
                    className="modern-select"
                  >
                    <option value="" disabled hidden></option>
                    <option value="0">Yok</option>
                    <option value="1">1 Adet</option>
                    <option value="2">2 Adet</option>
                    <option value="3">3 Adet</option>
                    <option value="4">4 Adet</option>
                    <option value="5">5+ Adet</option>
                  </select>
                  <label>Araç Adeti</label>
                  <MdExpandMore className="select-arrow-icon" />
                  <span className="focus-border"></span>
                </div>

                {parseInt(formData.aracAdeti) > 0 && (
                  <div
                    className="input-group input-with-icon input-with-suffix"
                    style={{ animation: "fadeIn 0.5s" }}
                  >
                    {/* ✅ Para yerine modern araç ikonu */}
                    <MdOutlineDirectionsCarFilled className="input-icon" />
                    <input
                      type="number"
                      name="aracDegeri"
                      value={formData.aracDegeri}
                      onChange={handleChange}
                      placeholder=" "
                    />
                    <label>Araç Değeri</label>
                    <span className="suffix">TL</span>
                    <span className="focus-border"></span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SAĞ KÖPRÜ */}
          <div className="neural-connection-bridge desktop-only">
            <svg
              className="neural-svg-bridge"
              viewBox="0 0 400 500"
              preserveAspectRatio="none"
            >
              <g>
                {rightBridge.lines.map((item) => (
                  <path
                    key={item.id}
                    d={item.path}
                    className="neural-line purple"
                    style={{ opacity: item.opacity }}
                  />
                ))}
              </g>
            </svg>
            <div className="dots-container">
              {rightBridge.lines.map((item) => (
                <div
                  key={`dot-${item.id}`}
                  className="data-light light-purple"
                  style={{
                    offsetPath: `path('${item.path}')`,
                    animationDuration: item.duration,
                    animationDelay: item.delay,
                  }}
                ></div>
              ))}
            </div>
          </div>

          {/* SAĞ KART */}
          <div className="neon-card card-mixed">
            <div className="desktop-only">
              {rightBridge.endNodes.map((node) => (
                <div
                  key={`r-end-${node.id}`}
                  className={`connection-node node-left-edge ${node.colorClass}`}
                  style={{ top: node.percent }}
                ></div>
              ))}
            </div>
            <h3 className="card-title">Borç & Geçmiş</h3>
            <div className="card-content">
              <div className="grid-2-col">
                <div className="input-group input-with-icon">
                  <MdAccountBalanceWallet className="input-icon" />
                  <input
                    type="number"
                    name="toplamBorc"
                    value={formData.toplamBorc}
                    onChange={handleChange}
                    placeholder=" "
                  />
                  <label>Toplam Borç</label>
                  <span className="focus-border"></span>
                </div>
                <div className="input-group input-with-icon">
                  <MdCreditCard className="input-icon" />
                  <input
                    type="number"
                    name="krediLimiti"
                    value={formData.krediLimiti}
                    onChange={handleChange}
                    placeholder=" "
                  />
                  <label>Kredi Limiti</label>
                  <span className="focus-border"></span>
                </div>
              </div>
              <div className="gauges-container">
                <div className="gauge-item">
                  <label>Limit Doluluk</label>
                  <div
                    className="circular-chart blue-chart"
                    style={{ "--percentage": limitDolulukOrani }}
                  >
                    <div className="inner-circle">{limitDolulukOrani}%</div>
                  </div>
                </div>
                <div className="gauge-item">
                  <label>Borç/Gelir</label>
                  <div
                    className="circular-chart purple-chart"
                    style={{ "--percentage": borcGelirOrani }}
                  >
                    <div className="inner-circle">{borcGelirOrani}%</div>
                  </div>
                </div>
              </div>
              <div className="grid-2-col">
                <div className="input-group input-with-icon">
                  <MdWarning className="input-icon" />
                  <input
                    type="number"
                    name="gecikmeSon12Ay"
                    value={formData.gecikmeSon12Ay}
                    onChange={handleChange}
                    placeholder=" "
                  />
                  <label>Gecikme (12 Ay)</label>
                  <span className="focus-border"></span>
                </div>
                <div className="input-group input-with-icon input-with-suffix">
                  <MdPercent className="input-icon" />
                  <input
                    type="number"
                    name="ortOdemeOrani"
                    value={formData.ortOdemeOrani}
                    onChange={handleChange}
                    placeholder=" "
                  />
                  <label>Ort. Ödeme</label>
                  <span className="suffix">%</span>
                  <span className="focus-border"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- FOOTER BUTON --- */}
        <div className="form-footer">
          <button type="submit" className="neon-button">
            ANALİZ ET
          </button>
        </div>
      </form>

      {/* --- SONUÇ PANELİ (3D KART SAHNESİ) --- */}
      <div ref={resultSectionRef} className="result-anchor">
        {resultData && (
          <div className="result-stage">
            <button
              type="button"
              className="result-close-btn"
              onClick={() => {
                setResultData(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-label="Kapat"
              title="Kapat"
            >
              <MdClose size={20} />
            </button>
            {/* 3D KART */}
            <div
              className={`credit-card-3d ${
                resultData.prediction === 0 ? "card-success" : "card-risk"
              }`}
              ref={cardRef}
              onMouseMove={handleCardMove}
              onMouseLeave={handleCardLeave}
              style={{
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              }}
            >
              <div className="card-shine"></div>

              <div className="card-content-layer">
                <div className="card-top">
                  <div className="bank-title">
                    <span>
                      AI BANK <span style={{ fontWeight: "300" }}>NEURAL</span>
                    </span>

                    <div className="bank-right">
                      <div
                        className={`brand-master ${
                          masterGlitch ? "glitch-150" : ""
                        }`}
                      >
                        MASTER CARD
                      </div>
                      <MdNfc size={28} style={{ opacity: 0.7 }} />
                    </div>
                  </div>
                  <div className="chip-img">
                    <div
                      className="chip-line"
                      style={{ width: "100%", height: "1px", top: "33%" }}
                    ></div>
                    <div
                      className="chip-line"
                      style={{ width: "100%", height: "1px", top: "66%" }}
                    ></div>
                    <div
                      className="chip-line"
                      style={{ width: "1px", height: "100%", left: "33%" }}
                    ></div>
                    <div
                      className="chip-line"
                      style={{ width: "1px", height: "100%", left: "66%" }}
                    ></div>
                  </div>
                </div>

                {/* Animasyonlu Skor */}
                <div className="score-display">
                  <span className="score-label">KREDİ PUANI</span>
                  <span className="score-number">{displayScore}</span>
                </div>

                <div className="card-footer">
                  <div className="customer-info">
                    <h5>MÜŞTERİ</h5>
                    <p>AD SOYAD</p>
                  </div>
                  <div className="status-text">
                    {resultData.prediction === 0 ? (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "1.1rem",
                          fontWeight: "bold",
                        }}
                      >
                        ONAYLANDI <MdCheckCircle />
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "1.1rem",
                          fontWeight: "bold",
                        }}
                      >
                        REDDEDİLDİ <MdCancel />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* DETAYLI AÇIKLAMA KUTULARI (RAPOR) */}
            <div className="decision-report">
              {/* OLUMLU NEDENLER */}
              <div className="report-box positive">
                <h4>
                  <MdTrendingUp /> Nedenler (Olumlu)
                </h4>
                <ul className="reason-list">
                  {(resultData.positives && resultData.positives.length > 0
                    ? resultData.positives
                    : fallbackReasons.positives
                  ).length > 0 ? (
                    (resultData.positives && resultData.positives.length > 0
                      ? resultData.positives
                      : fallbackReasons.positives
                    ).map((item, idx) => <li key={idx}>{item}</li>)
                  ) : (
                    <li>Belirgin bir olumlu etken bulunamadı.</li>
                  )}
                </ul>
              </div>

              {/* OLUMSUZ NEDENLER */}
              <div className="report-box negative">
                <h4>
                  <MdWarning /> Risk Faktörleri
                </h4>
                <ul className="reason-list">
                  {resultData.reasons && resultData.reasons.length > 0 ? (
                    resultData.reasons.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))
                  ) : (
                    <li>Önemli bir risk tespit edilmedi.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* YÜKLENİYOR EKRANI */}
      {isLoading && (
        <div className="cyber-loader-overlay">
          <div className="loader-content">
            <div className="spinner"></div>
            <p>SİNİR AĞLARI HESAPLIYOR...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

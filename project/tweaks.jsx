/* ============================================================
   FUTUREMATCH — Tweaks island
   course type preset + accent override
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "courseType": "ledelse",
  "accent": ["#FF5A1F", "#D8410C", "#1A0E04"]
}/*EDITMODE-END*/;

const COURSE_TYPES = [
  { value: "ledelse",  label: "Ledelse & Kommunikation" },
  { value: "it",       label: "IT & Data" },
  { value: "cert",     label: "Certificering" },
  { value: "sundhed",  label: "Sundhed & Omsorg" },
  { value: "amu",      label: "AMU / Erhvervsfaglig" }
];

const ACCENT_PRESETS = {
  ledelse: ["#FF5A1F","#D8410C","#1A0E04"],
  it:      ["#3A6FF8","#1E4FD8","#FFFFFF"],
  cert:    ["#6B4DE0","#4B30C0","#FFFFFF"],
  sundhed: ["#2F8F63","#1E6344","#F3EEE2"],
  amu:     ["#C7553A","#9C3C24","#FBF3EB"]
};

const ACCENT_OPTIONS = [
  ["#FF5A1F","#D8410C","#1A0E04"],
  ["#3A6FF8","#1E4FD8","#FFFFFF"],
  ["#6B4DE0","#4B30C0","#FFFFFF"],
  ["#2F8F63","#1E6344","#F3EEE2"],
  ["#C7553A","#9C3C24","#FBF3EB"]
];

function FuturematchTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  /* when course type changes → run full preset (content + accent) */
  React.useEffect(() => {
    if (window.setCoursePreset) {
      window.setCoursePreset(t.courseType);
    }
    /* sync accent swatch to preset default */
    const preset = ACCENT_PRESETS[t.courseType];
    if (preset) setTweak('accent', preset);
  }, [t.courseType]);

  /* when accent is manually overridden → apply just the color vars */
  React.useEffect(() => {
    const a = t.accent || ACCENT_PRESETS.ledelse;
    document.documentElement.style.setProperty('--accent', a[0]);
    document.documentElement.style.setProperty('--accent-deep', a[1]);
    document.documentElement.style.setProperty('--on-accent', a[2]);
  }, [t.accent]);

  return (
    <TweaksPanel>
      <TweakSection label="Kursustype" />
      <TweakSelect
        label="Kategori"
        value={t.courseType}
        options={COURSE_TYPES.map(c => c.value)}
        labels={COURSE_TYPES.map(c => c.label)}
        onChange={(v) => setTweak('courseType', v)}
      />
      <TweakSection label="Accent" />
      <TweakColor
        label="Accentfarve"
        value={t.accent}
        options={ACCENT_OPTIONS}
        onChange={(v) => setTweak('accent', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<FuturematchTweaks />);

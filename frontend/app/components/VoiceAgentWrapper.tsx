"use client";

import { useState, useEffect, useRef } from "react";

type Mode = "voice" | "text";
type PanelState = "closed" | "open";
type Screen = "main" | "settings";
type AIProvider = "openai" | "anthropic" | "groq" | "ollama";

export default function VoiceAgentWrapper() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    return <InnerVoiceAgent />;
}

function InnerVoiceAgent() {
    const [panel, setPanel]               = useState<PanelState>("closed");
    const [screen, setScreen]             = useState<Screen>("main");
    const [mode, setMode]                 = useState<Mode>("voice");
    const [isListening, setIsListening]   = useState(false);
    const [isSpeaking, setIsSpeaking]     = useState(false);
    const [status, setStatus]             = useState("How can I help you?");
    const [textInput, setTextInput]       = useState("");
    const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null);
    const [ttsEnabled, setTtsEnabled]     = useState<boolean | null>(null);
    const [currentProvider, setCurrentProvider] = useState<AIProvider>("openai");

    // Settings fields
    const [aiProvider, setAiProvider]   = useState<AIProvider>("openai");
    const [openaiKey, setOpenaiKey]     = useState("");
    const [anthropicKey, setAnthropicKey] = useState("");
    const [groqKey, setGroqKey]         = useState("");
    const [ollamaUrl, setOllamaUrl]     = useState("http://localhost:11434");
    const [elevenKey, setElevenKey]     = useState("");
    const [savingKeys, setSavingKeys]   = useState(false);
    const [saveMsg, setSaveMsg]         = useState("");

    const inputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        fetch("http://localhost:8000/api/voice/status")
            .then(r => r.json())
            .then(d => {
                setVoiceEnabled(d.enabled);
                if (d.provider) setCurrentProvider(d.provider as AIProvider);
            })
            .catch(() => setVoiceEnabled(false));
        fetch("http://localhost:8000/api/tts/status")
            .then(r => r.json()).then(d => setTtsEnabled(d.enabled))
            .catch(() => setTtsEnabled(false));
    }, []);

    useEffect(() => {
        if (mode === "text" && panel === "open") {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [mode, panel]);

    const saveKeys = async () => {
        setSavingKeys(true);
        setSaveMsg("");
        try {
            const res = await fetch("http://localhost:8000/api/save_keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    openai_key: openaiKey,
                    elevenlabs_key: elevenKey,
                    anthropic_key: anthropicKey,
                    groq_key: groqKey,
                    ollama_url: ollamaUrl,
                    ai_provider: aiProvider,
                }),
            });
            if (res.ok) {
                setCurrentProvider(aiProvider);
                // Re-poll both status endpoints — keys are live immediately (no restart needed)
                const [voiceRes, ttsRes] = await Promise.all([
                    fetch("http://localhost:8000/api/voice/status").then(r => r.json()).catch(() => ({ enabled: false })),
                    fetch("http://localhost:8000/api/tts/status").then(r => r.json()).catch(() => ({ enabled: false })),
                ]);
                setVoiceEnabled(voiceRes.enabled);
                setTtsEnabled(ttsRes.enabled);
                setSaveMsg(voiceRes.enabled ? "✅ Keys saved and active!" : "✅ Keys saved! Voice requires a valid API key.");
            } else {
                setSaveMsg("❌ Failed to save keys.");
            }
        } catch {
            setSaveMsg("❌ Cannot reach backend.");
        }
        setSavingKeys(false);
    };

    const speakReply = async (text: string) => {
        if (ttsEnabled) {
            try {
                const res = await fetch("http://localhost:8000/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text }),
                });
                const data = await res.json();
                if (!data.disabled && data.audio) {
                    const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
                    audioRef.current = audio;
                    audio.onplay  = () => setIsSpeaking(true);
                    audio.onended = () => setIsSpeaking(false);
                    audio.onerror = () => setIsSpeaking(false);
                    audio.play();
                    return;
                }
            } catch { }
        }
        // Fallback to browser TTS
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.name.includes("Samantha") || v.name.includes("Google US English") || v.name.includes("Alex")
        );
        if (preferred) utterance.voice = preferred;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend   = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    };

    const sendQuery = async (query: string) => {
        setStatus("Thinking...");
        try {
            const res = await fetch("http://localhost:8000/api/voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });
            if (!res.ok) { setStatus("❌ Backend error."); return; }
            const data = await res.json();
            if (data.disabled) { setVoiceEnabled(false); setStatus("Add your API key in ⚙️ Settings."); return; }
            setStatus(data.reply);
            if (mode === "voice") speakReply(data.reply);
        } catch {
            setStatus("❌ Cannot reach backend. Is it running on port 8000?");
        }
    };

    const handleVoiceInput = () => {
        if (!voiceEnabled) { setStatus("Add your API key in ⚙️ Settings."); return; }
        if (isSpeaking) { stopSpeaking(); return; }
        if (isListening) return;
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { setStatus("❌ Use Chrome for voice input."); return; }
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => { setIsListening(true); setStatus("🎙️ Listening..."); };
        recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            setIsListening(false);
            setStatus(`You: "${transcript}"`);
            await sendQuery(transcript);
        };
        recognition.onerror = (event: any) => {
            setIsListening(false);
            setStatus(event.error === "not-allowed" ? "❌ Mic access denied." : `❌ Mic error: ${event.error}`);
        };
        recognition.start();
    };

    const handleTextSubmit = async () => {
        const query = textInput.trim();
        if (!query) return;
        setTextInput("");
        setStatus(`You: "${query}"`);
        await sendQuery(query);
    };

    const providerLabels: Record<AIProvider, string> = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        groq: "Groq",
        ollama: "Ollama (Local)",
    };

    const providerSubtitle = () => {
        if (!voiceEnabled) return "⚙️ Add API keys to enable";
        const p = providerLabels[currentProvider] ?? currentProvider;
        return ttsEnabled ? `${p} • ElevenLabs voice` : `${p} • Browser voice`;
    };

    const VigilLogo = () => (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="7" fill="#c0392b" />
            <text x="14" y="20" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="sans-serif">V</text>
        </svg>
    );

    // ── Shared input style ───────────────────────────────────────────────────
    const inputStyle: React.CSSProperties = {
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: "8px",
        padding: "8px 12px",
        color: "#fff",
        fontSize: "12px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => {
                    setPanel(panel === "closed" ? "open" : "closed");
                    setScreen("main");
                    setStatus("How can I help you?");
                }}
                title="Vigil AI Assistant"
                style={{
                    position: "fixed", bottom: "28px", right: "28px",
                    width: "56px", height: "56px", borderRadius: "50%",
                    border: "none", cursor: "pointer",
                    backgroundColor: "#c0392b", color: "white",
                    boxShadow: "0 4px 20px rgba(192,57,43,0.5)",
                    zIndex: 9999, transition: "transform 0.2s",
                    transform: panel === "open" ? "scale(1.1)" : "scale(1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                {panel === "open" ? (
                    <span style={{ fontSize: "20px" }}>✕</span>
                ) : (
                    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <text x="14" y="21" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="sans-serif">V</text>
                    </svg>
                )}
            </button>

            {/* Panel */}
            {panel === "open" && (
                <div style={{
                    position: "fixed", bottom: "96px", right: "28px", width: "320px",
                    backgroundColor: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "16px",
                    padding: "20px", zIndex: 9998, boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
                    display: "flex", flexDirection: "column", gap: "16px",
                }}>

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <VigilLogo />
                            <div>
                                <p style={{ margin: 0, color: "#fff", fontWeight: 600, fontSize: "14px" }}>Vigil Assistant</p>
                                <p style={{ margin: 0, color: "#555", fontSize: "11px" }}>{providerSubtitle()}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setScreen(screen === "settings" ? "main" : "settings")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: screen === "settings" ? "#c0392b" : "#555", padding: "4px" }}
                            title="Settings"
                        >⚙️</button>
                    </div>

                    {/* ── SETTINGS SCREEN ── */}
                    {screen === "settings" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <p style={{ margin: 0, color: "#888", fontSize: "12px" }}>
                                Keys are saved to your local <code style={{ color: "#c0392b" }}>.env</code> file and never leave your machine.
                            </p>

                            {/* AI Provider selector */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <label style={{ color: "#aaa", fontSize: "11px" }}>AI Provider</label>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {(["openai", "anthropic", "groq", "ollama"] as AIProvider[]).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setAiProvider(p)}
                                            style={{
                                                flex: "1 1 calc(50% - 6px)",
                                                padding: "7px 6px",
                                                borderRadius: "8px",
                                                border: "1px solid",
                                                borderColor: aiProvider === p ? "#c0392b" : "#333",
                                                cursor: "pointer",
                                                fontSize: "11px",
                                                fontWeight: 500,
                                                backgroundColor: aiProvider === p ? "rgba(192,57,43,0.15)" : "#1a1a1a",
                                                color: aiProvider === p ? "#e74c3c" : "#666",
                                                transition: "all 0.15s",
                                            }}
                                        >
                                            {providerLabels[p]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Provider-specific key field */}
                            {aiProvider === "openai" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <label style={{ color: "#aaa", fontSize: "11px" }}>OpenAI API Key</label>
                                    <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)}
                                        placeholder="sk-..." style={inputStyle} />
                                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                                        style={{ color: "#c0392b", fontSize: "11px" }}>Get an OpenAI key →</a>
                                </div>
                            )}
                            {aiProvider === "anthropic" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <label style={{ color: "#aaa", fontSize: "11px" }}>Anthropic API Key</label>
                                    <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                                        placeholder="sk-ant-..." style={inputStyle} />
                                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                                        style={{ color: "#c0392b", fontSize: "11px" }}>Get an Anthropic key →</a>
                                </div>
                            )}
                            {aiProvider === "groq" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <label style={{ color: "#aaa", fontSize: "11px" }}>Groq API Key</label>
                                    <input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)}
                                        placeholder="gsk_..." style={inputStyle} />
                                    <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
                                        style={{ color: "#c0392b", fontSize: "11px" }}>Get a free Groq key →</a>
                                </div>
                            )}
                            {aiProvider === "ollama" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <label style={{ color: "#aaa", fontSize: "11px" }}>Ollama URL</label>
                                    <input type="text" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)}
                                        placeholder="http://localhost:11434" style={inputStyle} />
                                    <p style={{ margin: 0, color: "#555", fontSize: "11px" }}>
                                        Runs fully local — no API key needed.{" "}
                                        <a href="https://ollama.com" target="_blank" rel="noreferrer"
                                            style={{ color: "#c0392b" }}>Install Ollama →</a>
                                    </p>
                                </div>
                            )}

                            {/* ElevenLabs key — always shown */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <label style={{ color: "#aaa", fontSize: "11px" }}>ElevenLabs Key <span style={{ color: "#555" }}>(optional, for better voice)</span></label>
                                <input type="password" value={elevenKey} onChange={e => setElevenKey(e.target.value)}
                                    placeholder="Your ElevenLabs key..." style={inputStyle} />
                                <a href="https://elevenlabs.io" target="_blank" rel="noreferrer"
                                    style={{ color: "#c0392b", fontSize: "11px" }}>Get a free ElevenLabs key →</a>
                            </div>

                            <button
                                onClick={saveKeys}
                                disabled={savingKeys}
                                style={{ backgroundColor: "#c0392b", border: "none", borderRadius: "8px", padding: "10px", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                            >
                                {savingKeys ? "Saving..." : "Save Keys"}
                            </button>
                            {saveMsg && <p style={{ margin: 0, color: "#aaa", fontSize: "12px" }}>{saveMsg}</p>}
                        </div>
                    )}

                    {/* ── MAIN SCREEN ── */}
                    {screen === "main" && (
                        <>
                            {/* Mode toggle */}
                            <div style={{ display: "flex", backgroundColor: "#1a1a1a", borderRadius: "8px", padding: "3px", gap: "3px" }}>
                                {(["voice", "text"] as Mode[]).map((m) => (
                                    <button key={m} onClick={() => setMode(m)} style={{
                                        flex: 1, padding: "6px", borderRadius: "6px", border: "none", cursor: "pointer",
                                        fontSize: "12px", fontWeight: 500,
                                        backgroundColor: mode === m ? "#c0392b" : "transparent",
                                        color: mode === m ? "#fff" : "#666", transition: "all 0.15s",
                                    }}>
                                        {m === "voice" ? "🎙️ Voice" : "⌨️ Text"}
                                    </button>
                                ))}
                            </div>

                            {/* Status box */}
                            <div style={{ backgroundColor: "#1a1a1a", borderRadius: "10px", padding: "12px", minHeight: "72px", display: "flex", alignItems: "center" }}>
                                <p style={{ margin: 0, color: "#ccc", fontSize: "13px", lineHeight: "1.5" }}>{status}</p>
                            </div>

                            {/* Voice controls */}
                            {mode === "voice" && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                                    <button onClick={handleVoiceInput} style={{
                                        width: "64px", height: "64px", borderRadius: "50%", border: "none",
                                        cursor: voiceEnabled ? "pointer" : "not-allowed", fontSize: "26px",
                                        backgroundColor: isListening ? "#ef4444" : isSpeaking ? "#f59e0b" : voiceEnabled ? "#c0392b" : "#374151",
                                        opacity: voiceEnabled ? 1 : 0.5,
                                        boxShadow: isListening ? "0 0 20px #ef4444" : "none", transition: "all 0.2s",
                                    }}>
                                        {isListening ? "⏹" : isSpeaking ? "🔊" : "🎙️"}
                                    </button>
                                    <p style={{ color: "#555", fontSize: "11px", margin: 0 }}>
                                        {isListening ? "Listening... speak now" : isSpeaking ? "Click to stop" : voiceEnabled ? "Click to speak" : "Add API key in ⚙️ Settings"}
                                    </p>
                                </div>
                            )}

                            {/* Text controls */}
                            {mode === "text" && (
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <input ref={inputRef} value={textInput}
                                        onChange={e => setTextInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                                        placeholder="Ask about alerts, logs..."
                                        style={{ flex: 1, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px", padding: "8px 12px", color: "#fff", fontSize: "13px", outline: "none" }}
                                    />
                                    <button onClick={handleTextSubmit} style={{ backgroundColor: "#c0392b", border: "none", borderRadius: "8px", padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: "16px" }}>↑</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
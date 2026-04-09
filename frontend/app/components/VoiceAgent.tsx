"use client";

import { useState, useEffect, useRef } from "react";

type Mode = "voice" | "text";
type PanelState = "closed" | "open";

export default function VoiceAgent() {
    const [panel, setPanel] = useState<PanelState>("closed");
    const [mode, setMode] = useState<Mode>("voice");
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [status, setStatus] = useState("How can I help you?");
    const [textInput, setTextInput] = useState("");
    const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Check if voice is enabled when component loads
    useEffect(() => {
        fetch("http://localhost:8000/api/voice/status")
            .then((res) => res.json())
            .then((data) => setVoiceEnabled(data.enabled))
            .catch(() => setVoiceEnabled(false));
    }, []);

    // Focus text input when switching to text mode
    useEffect(() => {
        if (mode === "text" && panel === "open") {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [mode, panel]);

    // --- Send a query to the backend (used by both voice and text mode) ---
    const sendQuery = async (query: string) => {
        setStatus("Thinking...");
        try {
            const response = await fetch("http://localhost:8000/api/voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });

            if (!response.ok) {
                setStatus("❌ Backend error. Is the server running?");
                return;
            }

            const data = await response.json();

            if (data.disabled) {
                setVoiceEnabled(false);
                setStatus("Voice agent disabled — add OPENAI_API_KEY to .env.");
                return;
            }

            const reply = data.reply;
            setStatus(reply);

            // Speak the reply if in voice mode
            if (mode === "voice") {
                speakReply(reply);
            }

        } catch {
            setStatus("❌ Cannot reach backend. Is it running on port 8000?");
        }
    };

    // --- Text to speech with best available voice ---
    const speakReply = (text: string) => {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 0.9;
        utterance.volume = 1;

        // Try to find a better voice than the default
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.name.includes("Samantha") ||   // Mac's best voice
            v.name.includes("Google US English") ||
            v.name.includes("Alex")
        );
        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    };

    // --- Voice input handler ---
    const handleVoiceInput = () => {
        if (!voiceEnabled) {
            setStatus("Add OPENAI_API_KEY to .env to enable the voice agent.");
            return;
        }

        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        if (isListening) return;

        const SpeechRecognition =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setStatus("❌ Use Chrome for voice input — Firefox doesn't support it.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsListening(true);
            setStatus("🎙️ Listening...");
        };

        recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            setIsListening(false);
            setStatus(`You: "${transcript}"`);
            await sendQuery(transcript);
        };

        recognition.onerror = (event: any) => {
            setIsListening(false);
            setStatus(event.error === "not-allowed"
                ? "❌ Mic access denied. Check browser settings."
                : `❌ Mic error: ${event.error}`
            );
        };

        recognition.start();
    };

    // --- Text input handler ---
    const handleTextSubmit = async () => {
        const query = textInput.trim();
        if (!query) return;
        setTextInput("");
        setStatus(`You: "${query}"`);
        await sendQuery(query);
    };

    // --- UI ---
    return (
        <>
            {/* Floating button — always visible bottom right */}
            <button
                onClick={() => {
                    setPanel(panel === "closed" ? "open" : "closed");
                    setStatus("How can I help you?");
                }}
                title="Vigil AI Assistant"
                style={{
                    position: "fixed",
                    bottom: "28px",
                    right: "28px",
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "22px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    boxShadow: "0 4px 20px rgba(37,99,235,0.5)",
                    zIndex: 9999,
                    transition: "transform 0.2s, background-color 0.2s",
                    transform: panel === "open" ? "scale(1.1)" : "scale(1)",
                }}
            >
                {panel === "open" ? "✕" : "🛡️"}
            </button>

            {/* Popup panel */}
            {panel === "open" && (
                <div style={{
                    position: "fixed",
                    bottom: "96px",
                    right: "28px",
                    width: "320px",
                    backgroundColor: "#0f0f0f",
                    border: "1px solid #222",
                    borderRadius: "16px",
                    padding: "20px",
                    zIndex: 9998,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}>

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>🛡️</span>
                        <div>
                            <p style={{ margin: 0, color: "#fff", fontWeight: 600, fontSize: "14px" }}>
                                Vigil Assistant
                            </p>
                            <p style={{ margin: 0, color: "#555", fontSize: "11px" }}>
                                {voiceEnabled ? "AI-powered • Ask anything" : "Add OPENAI_API_KEY to enable"}
                            </p>
                        </div>
                    </div>

                    {/* Mode toggle */}
                    <div style={{
                        display: "flex",
                        backgroundColor: "#1a1a1a",
                        borderRadius: "8px",
                        padding: "3px",
                        gap: "3px",
                    }}>
                        {(["voice", "text"] as Mode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                style={{
                                    flex: 1,
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    backgroundColor: mode === m ? "#2563eb" : "transparent",
                                    color: mode === m ? "#fff" : "#666",
                                    transition: "all 0.15s",
                                }}
                            >
                                {m === "voice" ? "🎙️ Voice" : "⌨️ Text"}
                            </button>
                        ))}
                    </div>

                    {/* Status / reply box */}
                    <div style={{
                        backgroundColor: "#1a1a1a",
                        borderRadius: "10px",
                        padding: "12px",
                        minHeight: "72px",
                        display: "flex",
                        alignItems: "center",
                    }}>
                        <p style={{
                            margin: 0,
                            color: "#ccc",
                            fontSize: "13px",
                            lineHeight: "1.5",
                        }}>
                            {status}
                        </p>
                    </div>

                    {/* Voice mode controls */}
                    {mode === "voice" && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                            <button
                                onClick={handleVoiceInput}
                                style={{
                                    width: "64px",
                                    height: "64px",
                                    borderRadius: "50%",
                                    border: "none",
                                    cursor: voiceEnabled ? "pointer" : "not-allowed",
                                    fontSize: "26px",
                                    backgroundColor: isListening ? "#ef4444"
                                        : isSpeaking ? "#f59e0b"
                                            : voiceEnabled ? "#2563eb"
                                                : "#374151",
                                    opacity: voiceEnabled ? 1 : 0.5,
                                    boxShadow: isListening ? "0 0 20px #ef4444" : "none",
                                    transition: "all 0.2s",
                                }}
                            >
                                {isListening ? "⏹" : isSpeaking ? "🔊" : "🎙️"}
                            </button>
                            <p style={{ color: "#555", fontSize: "11px", margin: 0 }}>
                                {isListening ? "Listening... speak now"
                                    : isSpeaking ? "Click to stop"
                                        : voiceEnabled ? "Click to speak"
                                            : "API key required"}
                            </p>
                        </div>
                    )}

                    {/* Text mode controls */}
                    {mode === "text" && (
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                ref={inputRef}
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                                placeholder="Ask about alerts, logs..."
                                style={{
                                    flex: 1,
                                    backgroundColor: "#1a1a1a",
                                    border: "1px solid #333",
                                    borderRadius: "8px",
                                    padding: "8px 12px",
                                    color: "#fff",
                                    fontSize: "13px",
                                    outline: "none",
                                }}
                            />
                            <button
                                onClick={handleTextSubmit}
                                style={{
                                    backgroundColor: "#2563eb",
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "8px 14px",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                }}
                            >
                                ↑
                            </button>
                        </div>
                    )}

                </div>
            )}
        </>
    );
}
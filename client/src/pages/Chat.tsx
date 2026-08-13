import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useChat } from "@/hooks/use-chat";
import { NeonButton } from "@/components/NeonButton";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Sparkles, Mic, MicOff, Volume2, VolumeX, Type, Volume1, ImagePlus, X, Play, Loader2, Paperclip, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechRecognition, useStreamingTTS } from "@/hooks/use-voice";
import { EmojiPicker } from "@/components/EmojiPicker";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVoiceMode } from "@/contexts/VoiceModeContext";
import { useAvatar, getAvatarsByGender } from "@/contexts/AvatarContext";
import { TypingIndicator, PulseAvatar, MessageReveal } from "@/components/TypingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { useToast } from "@/hooks/use-toast";
import { PaywallPopup } from "@/components/PaywallPopup";
import { useQueryClient } from "@tanstack/react-query";
import { VoicePlaybackIndicator, ZeroTextVoiceInterface } from "@/components/AudioVisualizer";

// User preferences stored in localStorage
// Simplified to 2 modes: "text" (text only, no TTS) and "voice_command" (text + voice simultaneously)
type DisplayMode = "text" | "voice_command";

function getStoredDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "text"; // Default to text mode
  const stored = localStorage.getItem("xoxo_display_mode");
  if (stored === "text" || stored === "voice_command") {
    return stored;
  }
  // Migration from old modes
  if (stored === "both" || stored === "voice_only") {
    return "voice_command";
  }
  if (stored === "text_only") {
    return "text";
  }
  return "text"; // Default to text mode on app launch
}

function setStoredDisplayMode(mode: DisplayMode) {
  localStorage.setItem("xoxo_display_mode", mode);
}

const personalityThemes = {
  1: { nameKey: "personality.angel.name", color: "text-secondary", border: "border-secondary", glow: "shadow-secondary/20", bg: "bg-secondary/10" },
  2: { nameKey: "personality.bestie.name", color: "text-primary", border: "border-primary", glow: "shadow-primary/20", bg: "bg-primary/10" },
  3: { nameKey: "personality.snake.name", color: "text-accent", border: "border-accent", glow: "shadow-accent/20", bg: "bg-accent/10" },
};

// SubLevel names for each character
const subLevelNames = {
  1: { // Angel
    1: { tr: "Parti", en: "Party" },
    2: { tr: "Zen", en: "Zen" }
  },
  2: { // Bestie
    1: { tr: "Kanka", en: "Bestie" },
    2: { tr: "Mentor", en: "Mentor" }
  },
  3: { // Snake
    1: { tr: "Dominant", en: "Dominant" },
    2: { tr: "Alaycı", en: "Sarcastic" }
  }
};

export default function Chat() {
  const [, params] = useRoute("/chat/:level");
  const [, setLocation] = useLocation();
  const level = parseInt(params?.level || "2") as 1 | 2 | 3;
  const theme = personalityThemes[level];
  const { t, language } = useLanguage();
  const { getAvatar } = useAvatar();
  const { user } = useAuth();

  const [content, setContent] = useState("");
  const [isVoiceInput, setIsVoiceInput] = useState(false); // Track if current message is from voice
  const lastSpokenMessageRef = useRef<number | null>(null); // Track last spoken message ID to prevent duplicates
  const lastMessageWasVoiceRef = useRef<boolean>(false); // Track if last sent message was voice - determines TTS response
  // FIX: Mikrofon bırakıldığında güncel metni okumak için ref
  // (setTimeout içindeki "content" bayat kalıyordu -> sesli mesaj gönderilmiyordu)
  const contentRef = useRef<string>("");
  const [showCameraModal, setShowCameraModal] = useState(false); // Camera capture modal
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [subLevel, setSubLevel] = useState<1 | 2>(1); // NEW: 2-Level character system
  const queryClient = useQueryClient();
  
  // GLOBAL VOICE MODE STATE (ANAYASA KURALI #1)
  // isVoiceModeActive == true: Ghost Mode aktif - TTS çalışır, mesaj balonları GİZLİ
  // isVoiceModeActive == false: Metin Modu - TTS devre dışı, sadece metin balonları
  const { isVoiceModeActive, setVoiceModeActive, silentFallbackToText } = useVoiceMode();
  
  // Legacy displayMode compatibility - derived from global state
  const displayMode: DisplayMode = isVoiceModeActive ? "voice_command" : "text";
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Use global credits context for real-time sync
  // Admin (mehmet) users bypass all credit checks and never see payment page
  const { credits, isPremium, isGodMode, isAdmin, deductCredits, refreshCredits } = useCredits();
  
  // Derived states from global isVoiceModeActive
  // GHOST MODE: isVoiceModeActive == true -> TTS aktif, mesajlar GİZLİ
  // METIN MODU: isVoiceModeActive == false -> TTS devre dışı (maliyet koruması), sadece metin
  const autoSpeak = isVoiceModeActive; // TTS only when voice mode active
  const showText = !isVoiceModeActive; // Only show text in "Metin" mode
  const showVisualizer = isVoiceModeActive; // Show audio visualizer in voice mode
  
  // Handle display mode changes via global state
  const handleDisplayModeChange = (mode: DisplayMode) => {
    setVoiceModeActive(mode === "voice_command");
  };
  
  // Use authenticated user email for cross-device persistent memory
  const userIdForMemory = user?.email ? `email_${user.email}` : (user ? `user_${user.id}` : undefined);
  
  // Get gender-based avatars for AI characters
  const userGender = (user?.gender === "male" ? "male" : "female") as "male" | "female";
  const { messages, isLoading, isTyping, sendMessage, resetChat } = useChat(level, language, userIdForMemory, userGender, subLevel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const genderAvatars = getAvatarsByGender(userGender);
  
  // Get selected avatar or default based on user's gender
  const selectedAvatar = getAvatar(level);
  const avatarImage = selectedAvatar?.image || genderAvatars[level][0].image;

  // Voice hooks
  const { 
    isListening, 
    transcript, 
    error: speechError,
    isSupported: speechSupported, 
    startListening, 
    stopListening,
    resetTranscript 
  } = useSpeechRecognition(language);
  
  const { 
    isSpeaking,
    isLoading: ttsLoading,
    isSupported: ttsSupported, 
    speak, 
    stop: stopSpeaking,
    replayFromUrl,
    lastAudioUrl
  } = useStreamingTTS(level, user?.gender || "female", language); // Streaming TTS with personality-specific voice based on user gender
  
  // Store audio URLs for each message (for replay feature) - keyed by numeric message ID
  const [messageAudioUrls, setMessageAudioUrls] = useState<Record<number, string>>({});

  // Audio URLs are cached in-memory for current session replay only
  // Blob URLs don't persist across page refresh - audio is regenerated on demand

  // Update content when voice transcript changes
  useEffect(() => {
    if (transcript && transcript.trim()) {
      setContent(transcript);
      contentRef.current = transcript; // FIX: ref'i anında güncelle
      setIsVoiceInput(true);
    }
  }, [transcript]);

  // FIX: content her değiştiğinde ref'i senkron tut (klavye girişi dahil)
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Auto-speak new assistant messages ONLY if the last user message was voice input
  // TEXT messages get TEXT responses (no TTS)
  // VOICE messages get VOICE responses (with TTS)
  useEffect(() => {
    // Only speak if the last user message was from voice input
    if (!lastMessageWasVoiceRef.current) {
      return; // Text input - no TTS response
    }
    
    if (messages.length > 0 && ttsSupported) {
      const lastMessage = messages[messages.length - 1];
      // Only speak if it's an assistant message and we haven't spoken it yet
      if (lastMessage.role === "assistant" && lastSpokenMessageRef.current !== lastMessage.id) {
        lastSpokenMessageRef.current = lastMessage.id;
        // Speak and capture audio URL for replay
        speak(lastMessage.content).then((audioUrl) => {
          if (audioUrl && lastMessage.id) {
            // Store in local state for current session replay
            setMessageAudioUrls(prev => ({
              ...prev,
              [lastMessage.id]: audioUrl
            }));
          }
          // Reset voice flag after speaking
          lastMessageWasVoiceRef.current = false;
        }).catch(() => {
          // TTS error - just continue without voice
          lastMessageWasVoiceRef.current = false;
        });
      }
    }
  }, [messages.length, ttsSupported]); // Simplified deps - only track messages

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [content]);

  // WHATSAPP-STYLE PUSH-TO-TALK: Hold to record, release to send
  const handleVoiceStart = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent text selection on long press
    
    // Don't start if already listening
    if (isListening) return;
    
    // Check X-Credits before starting (only for non-premium/non-godmode/non-admin users)
    if (!isPremium && !isGodMode && !isAdmin && credits < 1) {
      toast({
        title: language === "tr" ? "Yetersiz Kredi" : "Insufficient Credits",
        description: language === "tr" 
          ? "Mesaj göndermek için en az 1 kredi gerekli" 
          : "You need at least 1 credit to send a message",
        variant: "destructive"
      });
      setShowPaywall(true);
      return;
    }
    
    resetTranscript();
    setContent("");
    setIsVoiceInput(false);
    startListening();
  };

  const handleVoiceEnd = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    
    if (!isListening) return;
    
    stopListening();
    
    // FIX: Konuşma tanıma sonuçları buton bırakıldıktan SONRA gelir.
    // Eski kod 150ms bekleyip bayat "content" state'ine bakıyordu ->
    // transkript henüz gelmemiş oluyordu ve mesaj hiç gönderilmiyordu.
    // Yeni: 500ms bekle + her zaman güncel olan contentRef'ten oku.
    setTimeout(() => {
      const finalText = contentRef.current.trim();
      if (finalText) {
        handleSubmit(true, finalText); // Mark as voice input + güncel metni geçir
      }
    }, 500);
  };

  // Legacy toggle for backward compatibility (used in ZeroTextVoiceInterface)
  const handleVoiceToggle = async () => {
    if (isListening) {
      stopListening();
      // FIX: bayat state yerine ref'ten oku, süreyi artır
      setTimeout(() => {
        const finalText = contentRef.current.trim();
        if (finalText) {
          handleSubmit(true, finalText);
        }
      }, 500);
    } else {
      if (!isPremium && !isGodMode && !isAdmin && credits < 1) {
        toast({
          title: language === "tr" ? "Yetersiz Kredi" : "Insufficient Credits",
          description: language === "tr" 
            ? "Mesaj göndermek için en az 1 kredi gerekli" 
            : "You need at least 1 credit to send a message",
          variant: "destructive"
        });
        setShowPaywall(true);
        return;
      }
      resetTranscript();
      setContent("");
      setIsVoiceInput(false);
      startListening();
    }
  };

  const handleSubmit = async (fromVoice: boolean = false, overrideText?: string) => {
    // GUARD: If image is selected, route to image submit (prevents duplicate credit deduction)
    if (selectedImage) {
      return handleImageSubmit();
    }
    
    // FIX: Sesli gönderimde bayat state yerine override/ref'ten oku
    const trimmedContent = (overrideText ?? content).trim();
    if (!trimmedContent || isLoading) return;
    
    // Capture voice input state before clearing
    const wasVoiceInput = fromVoice || isVoiceInput;
    
    // OPTIMISTIC: Kredi kontrolü ve mesaj gönderimi PARALEL yapılır
    // Backend tarafında da kredi kontrolü var — çift güvenlik
    const bypassCredits = isPremium || isGodMode || isAdmin;
    
    // Hemen UI'ı temizle — kullanıcı anında tepki hisseder
    setContent("");
    resetTranscript();
    setIsVoiceInput(false);
    lastMessageWasVoiceRef.current = wasVoiceInput;
    
    if (isListening) {
      stopListening();
    }
    textareaRef.current?.focus();
    
    const messageToSend = trimmedContent;
    
    if (!bypassCredits) {
      // Optimistic: kredi düş + mesaj gönder AYNI ANDA
      deductCredits(1); // UI'da anında güncelle
      
      // Arka planda kredi kontrolü yap
      fetch("/api/message-credits/use", {
        method: "POST",
        credentials: "include"
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.insufficientCredits) {
          // Kredi yokmuş — paywall göster
          refreshCredits(); // Gerçek kredi bakiyesini geri yükle
          setShowPaywall(true);
        }
      }).catch(() => {
        refreshCredits();
      });
      
      // Kredi sonucunu BEKLEMEDEN mesajı gönder
      await sendMessage(messageToSend);
    } else {
      await sendMessage(messageToSend);
    }
  };

  const handleReset = () => {
    setContent("");
    resetTranscript();
    stopSpeaking();
    resetChat();
  };

  const handleBack = () => {
    setLocation("/judgment");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // If image is selected, use image submit, otherwise normal submit
      if (selectedImage) {
        handleImageSubmit();
      } else {
        handleSubmit();
      }
    }
  };

  // Image upload handlers
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t("chat.error") || "Hata",
        description: t("chat.image_only") || "Sadece resim dosyaları yüklenebilir",
        variant: "destructive"
      });
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("chat.error") || "Hata",
        description: t("chat.image_too_large") || "Resim 5MB'dan küçük olmalı",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedImage(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  // Camera capture functions
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, // Back camera preferred
        audio: false 
      });
      cameraStreamRef.current = stream;
      setShowCameraModal(true);
      
      // Attach stream to video element after modal opens
      setTimeout(() => {
        if (videoRef.current && cameraStreamRef.current) {
          videoRef.current.srcObject = cameraStreamRef.current;
        }
      }, 100);
    } catch (error: any) {
      console.error("Camera access error:", error);
      toast({
        title: language === "tr" ? "Kamera Erişim Hatası" : "Camera Access Error",
        description: language === "tr" 
          ? "Kameraya erişim izni verin veya başka bir tarayıcı deneyin" 
          : "Please allow camera access or try another browser",
        variant: "destructive"
      });
    }
  };
  
  const closeCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setShowCameraModal(false);
  };
  
  const capturePhoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedImage(file);
        setImagePreview(canvas.toDataURL('image/jpeg'));
        closeCamera();
      }
    }, 'image/jpeg', 0.9);
  };
  
  const handleImageSubmit = async () => {
    if (!selectedImage || isLoading || isUploadingImage) return;
    
    // Credit check for non-premium users - image analysis costs 2 credits
    // Admin, God Mode and Premium users bypass image analysis credit check
    if (!isPremium && !isGodMode && !isAdmin) {
      if (credits < 2) {
        toast({
          title: language === "tr" ? "Yetersiz Kredi" : "Insufficient Credits",
          description: language === "tr" 
            ? `Görsel analizi için 2 kredi gerekli. Mevcut: ${credits}` 
            : `Image analysis requires 2 credits. Available: ${credits}`,
          variant: "destructive"
        });
        setShowPaywall(true);
        return;
      }
      
      try {
        const response = await fetch('/api/credits/use', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ amount: 2 }) // Image analysis costs 2 credits
        });
        const data = await response.json();
        if (!response.ok || data.insufficientCredits) {
          setShowPaywall(true);
          return;
        }
        deductCredits(2);
      } catch (error) {
        console.error("Credit deduction error:", error);
        setShowPaywall(true);
        return;
      }
    }
    
    setIsUploadingImage(true);
    
    try {
      // Convert image to base64
      const base64 = imagePreview?.split(',')[1];
      if (!base64) throw new Error("Failed to process image");
      
      // User message with image indicator
      const userMessage = content.trim() || (language === "tr" ? "Bu resmi yorumla" : "Analyze this image");
      
      // Clear input
      setContent("");
      clearSelectedImage();
      
      // Send with image
      await sendMessage(userMessage, base64, selectedImage.type);
      
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: t("chat.error") || "Hata",
        description: t("chat.image_upload_failed") || "Resim yüklenemedi",
        variant: "destructive"
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 flex-shrink-0">
        <button 
          onClick={handleBack}
          className="p-3 rounded-full hover:bg-white/5 transition-colors text-muted-foreground hover:text-white"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full overflow-hidden ring-2",
            theme.border.replace("border-", "ring-")
          )}>
            <img 
              src={avatarImage} 
              alt={t(theme.nameKey)} 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-center">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1 block">
              {t("chat.speaking_to")}
            </span>
            <h1 className={cn("text-xl font-display font-bold", theme.color)}>
              {t(theme.nameKey)}
            </h1>
          </div>
        </div>

        {/* Spacer to balance header layout */}
        <div className="w-11" />
      </header>

      {/* SubLevel Toggle - 2-Level Character System */}
      <div className="flex justify-center gap-2 mb-4 flex-shrink-0">
        <button
          onClick={() => { setSubLevel(1); resetChat(); }}
          className={cn(
            "font-body text-xs px-4 py-2 rounded-full transition-all duration-300 border",
            subLevel === 1 
              ? cn("text-white font-medium", theme.bg, theme.border, "shadow-lg", theme.glow)
              : "bg-white/5 border-white/10 text-muted-foreground hover-elevate"
          )}
          data-testid="button-sublevel-1"
        >
          {subLevelNames[level]?.[1]?.[language] || "Level 1"}
        </button>
        <button
          onClick={() => { setSubLevel(2); resetChat(); }}
          className={cn(
            "font-body text-xs px-4 py-2 rounded-full transition-all duration-300 border",
            subLevel === 2 
              ? cn("text-white font-medium", theme.bg, theme.border, "shadow-lg", theme.glow)
              : "bg-white/5 border-white/10 text-muted-foreground hover-elevate"
          )}
          data-testid="button-sublevel-2"
        >
          {subLevelNames[level]?.[2]?.[language] || "Level 2"}
        </button>
      </div>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto mb-4 space-y-4 min-h-0">
        {/* ZERO-TEXT VOICE INTERFACE - Centered full-screen voice experience */}
        {showVisualizer && (
          <div className="flex items-center justify-center h-full">
            {(() => {
              const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
              const hasAudioForLastAssistant = lastAssistantMessage && messageAudioUrls[lastAssistantMessage.id];
              
              return (
                <ZeroTextVoiceInterface
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  isProcessing={isTyping || ttsLoading}
                  characterName={t(theme.nameKey)}
                  avatarUrl={avatarImage}
                  personality={level}
                  hasAudioUrl={!!hasAudioForLastAssistant}
                  onReplay={() => {
                    if (hasAudioForLastAssistant) {
                      replayFromUrl(messageAudioUrls[lastAssistantMessage.id]);
                    }
                  }}
                  onStop={stopSpeaking}
                  onMicToggle={speechSupported ? handleVoiceToggle : undefined}
                  onModeSwitch={() => setVoiceModeActive(false)}
                  micSupported={speechSupported}
                />
              );
            })()}
          </div>
        )}

        {/* TEXT MODE - Traditional chat bubbles */}
        {showText && (
          <>
            {messages.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center py-12 space-y-4">
                  <div className={cn(
                    "w-24 h-24 rounded-full overflow-hidden mx-auto ring-4",
                    theme.border.replace("border-", "ring-"),
                    "opacity-50"
                  )}>
                    <img src={avatarImage} alt={t(theme.nameKey)} className="w-full h-full object-cover" />
                  </div>
                  <p className="font-body text-muted-foreground text-lg">
                    {t("chat.empty_title")}
                  </p>
                  <p className="font-body text-muted-foreground/50 text-sm">
                    {t("chat.empty_subtitle")}
                  </p>
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {/* Avatar for assistant messages */}
                  {message.role === "assistant" && (
                    <div className={cn(
                      "w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2",
                      theme.border.replace("border-", "ring-")
                    )}>
                      <img src={avatarImage} alt={t(theme.nameKey)} className="w-full h-full object-cover" />
                    </div>
                  )}
                  
                  {/* Message bubble */}
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-5 py-3",
                    message.role === "user" 
                      ? "bg-white/10 text-white" 
                      : cn("glass-panel border-l-2", theme.border)
                  )}>
                    {/* Text content with inline Play button for audio replay */}
                    <div className="transition-all duration-300 flex items-start gap-2">
                      <div className="flex-1">
                        {message.role === "assistant" && (message as any).isRevealing ? (
                          <MessageReveal 
                            text={message.content} 
                            typingInfo={(message as any).typingInfo}
                            className="font-body text-base leading-relaxed whitespace-pre-wrap"
                          />
                        ) : (
                          <p className="font-body text-base leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </p>
                        )}
                      </div>
                      
                      {/* Play button for assistant messages - replay cached or generate new */}
                      {message.role === "assistant" && ttsSupported && (
                        <button
                          onClick={async () => {
                            if (isSpeaking) {
                              stopSpeaking();
                            } else if (messageAudioUrls[message.id]) {
                              replayFromUrl(messageAudioUrls[message.id]);
                            } else {
                              const audioUrl = await speak(message.content);
                              if (audioUrl) {
                                setMessageAudioUrls(prev => ({
                                  ...prev,
                                  [message.id]: audioUrl
                                }));
                              }
                            }
                          }}
                          disabled={ttsLoading}
                          className={cn(
                            "flex-shrink-0 p-1.5 rounded-full transition-all duration-300 hover-elevate active-elevate-2",
                            ttsLoading
                              ? "text-muted-foreground/30 cursor-wait"
                              : isSpeaking 
                                ? "text-primary animate-pulse" 
                                : "text-muted-foreground/60 hover:text-white"
                          )}
                          data-testid={`button-replay-message-${index}`}
                          title={language === "tr" ? (messageAudioUrls[message.id] ? "Tekrar dinle" : "Sesli dinle") : (messageAudioUrls[message.id] ? "Replay audio" : "Listen")}
                        >
                          {ttsLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isSpeaking ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* User avatar */}
                  {message.role === "user" && (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                      </svg>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator with pulse avatar */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 justify-start"
              >
                <PulseAvatar 
                  src={avatarImage} 
                  alt={t(theme.nameKey)} 
                  isTyping={true}
                  personality={level}
                  size="md"
                />
                <div className="glass-panel rounded-2xl px-3 py-2">
                  <TypingIndicator personality={level} />
                </div>
              </motion.div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* STATIC 80px BOTTOM NAVIGATION BAR - ÇİVİLENDİ */}
      {/* All input elements locked inside fixed 80px bar */}
      {/* ================================================================ */}
      {/* BOTTOM NAV BAR - 80px FIXED HEIGHT (ÇİVİLENDİ)                 */}
      {/* TİTREME ENGELLENDİ - SABİT YÜKSEKLİK                           */}
      {/* ================================================================ */}
      <div 
        className="glass-panel"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: '80px', // ÇİVİLENDİ - TİTREME ENGELLENDİ
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '16px',
          paddingRight: '16px',
          gap: '8px',
        }}
        data-testid="bottom-nav-bar"
      >
        {/* WHATSAPP-STYLE INPUT BAR - Mobile responsive */}
        {/* Left: White rounded container with emoji, message, clip, camera */}
        <div className="flex-1 min-w-0 flex items-center bg-white dark:bg-zinc-800 rounded-full px-1.5 sm:px-2 py-1 gap-0.5 sm:gap-1">
          {/* 1. EMOJI - Far left */}
          <EmojiPicker onEmojiSelect={(emoji) => setContent(prev => prev + emoji)} />
          
          {/* 2. MESAJ SATIRI - Message input field */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? t("chat.listening") : "Mesaj"}
            className="flex-1 min-w-0 bg-transparent text-zinc-800 dark:text-white px-1 sm:px-2 py-2 text-sm sm:text-base font-body focus:outline-none resize-none h-10 max-h-10 overflow-hidden placeholder:text-zinc-400"
            disabled={isLoading}
            rows={1}
          />
          
          {/* 3. DOSYA EKLE - File attachment button (clip icon) */}
          <button
            onClick={handleImageUploadClick}
            disabled={isLoading || isUploadingImage}
            className={cn(
              "flex items-center justify-center flex-shrink-0 p-1 sm:p-2 transition-colors",
              selectedImage
                ? "text-pink-500"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
            title={language === "tr" ? "Dosya ekle" : "Attach file"}
            data-testid="button-file-attach"
          >
            <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          
          {/* 4. KAMERA - Camera button - opens device camera */}
          <button
            onClick={openCamera}
            disabled={isLoading || isUploadingImage}
            className={cn(
              "flex items-center justify-center flex-shrink-0 p-1 sm:p-2 transition-colors",
              "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
            title={language === "tr" ? "Kamera" : "Camera"}
            data-testid="button-camera"
          >
            <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* 5. MİKROFON - Right: Green circular microphone OR Send button */}
        {content.trim() || selectedImage ? (
          /* Send Button - shown when there's content */
          <button
            onClick={selectedImage ? handleImageSubmit : () => handleSubmit(false)}
            disabled={isLoading || isUploadingImage}
            className={cn(
              "flex items-center justify-center rounded-full flex-shrink-0 transition-all w-10 h-10 sm:w-12 sm:h-12",
              level === 1 ? "bg-secondary text-white" : 
              level === 3 ? "bg-accent text-white" : 
              "bg-primary text-white"
            )}
            data-testid="button-send"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>
        ) : (
          /* Green Microphone - Hold to talk, release to send */
          <button
            onClick={speechSupported ? handleVoiceToggle : undefined}
            disabled={isLoading || !speechSupported}
            title={!speechSupported 
              ? "Ses tanıma bu tarayıcıda desteklenmiyor" 
              : language === "tr" 
                ? "Basılı tutarak konuş, bırakınca gönder" 
                : "Hold to talk, release to send"
            }
            className={cn(
              "flex items-center justify-center rounded-full flex-shrink-0 select-none touch-none transition-all w-10 h-10 sm:w-12 sm:h-12",
              !speechSupported
                ? "bg-zinc-400 text-white/50 cursor-not-allowed"
                : isListening 
                  ? "bg-red-500 text-white scale-110 ring-4 ring-red-500/30" 
                  : "bg-primary text-white hover:bg-primary/90 active:scale-95"
            )}
            data-testid="button-voice-input-fixed"
          >
            <Mic className={cn("w-4 h-4 sm:w-5 sm:h-5", isListening && "animate-pulse")} />
          </button>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
        data-testid="input-image-file"
      />

      {/* Image Preview - shown above bottom bar */}
      {imagePreview && (
        <div 
          className="glass-panel rounded-2xl p-2 flex items-center gap-2"
          style={{ position: 'fixed', bottom: '90px', left: '16px', right: '16px', zIndex: 9997 }}
        >
          <div className="relative">
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="w-16 h-16 object-cover rounded-lg border border-pink-500/30"
              data-testid="image-preview"
            />
            <button
              onClick={clearSelectedImage}
              className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
              data-testid="button-remove-image"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm text-white/70 flex-1">
            {language === "en" ? "Resim seçildi - mesaj yazıp gönder" : "Image selected - type a message and send"}
          </p>
        </div>
      )}

      {/* Status messages */}
      {isListening && (
        <div 
          className="text-center text-sm text-red-400 animate-pulse font-body glass-panel rounded-full px-4 py-2"
          style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', zIndex: 9997 }}
        >
          {t("chat.continue_speaking")}
        </div>
      )}
      
      {speechError && (
        <div 
          className="text-center text-sm text-yellow-400 font-body glass-panel rounded-full px-4 py-2"
          style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', zIndex: 9997 }}
        >
          {speechError === "not-allowed" 
            ? t("chat.mic_permission")
            : `${t("chat.speech_error")}: ${speechError}`}
        </div>
      )}
      
      {/* Voice Limit Paywall */}
      <PaywallPopup
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        type="voice_limit"
      />
      
      {/* Camera Capture Modal */}
      {showCameraModal && (
        <div 
          className="fixed inset-0 z-[9999] bg-black flex flex-col"
          data-testid="camera-modal"
        >
          {/* Camera viewfinder */}
          <div className="flex-1 relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Camera controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-8 bg-gradient-to-t from-black/80 to-transparent">
            {/* Close button */}
            <button
              onClick={closeCamera}
              className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white"
              data-testid="button-camera-close"
            >
              <X className="w-6 h-6" />
            </button>
            
            {/* Capture button */}
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-primary flex items-center justify-center"
              data-testid="button-camera-capture"
            >
              <div className="w-12 h-12 rounded-full bg-primary" />
            </button>
            
            {/* Placeholder for symmetry */}
            <div className="w-12 h-12" />
          </div>
        </div>
      )}
    </div>
  );
}

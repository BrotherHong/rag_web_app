import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getQuickQuestions, sendChatMessage, sendDirectQuery, getWelcomeMessage, getCategories } from '../services/api'
import { useDepartment } from '../contexts/DepartmentContext'
import { useQueryAuth } from '../contexts/QueryAuthContext'
import { API_CONFIG, APP_CONSTANTS } from '../config/constants'

function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { department, deptSlug } = useDepartment()
  const { user, logout } = useQueryAuth()
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 768
  })

  const [quickQuestions, setQuickQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null) // null 表示「全部」
  const [directQueryLoading, setDirectQueryLoading] = useState(null) // 儲存正在處理的 messageId
  const [assistantName, setAssistantName] = useState(null)
  const [assistantAvatar, setAssistantAvatar] = useState(null)
  const [assistantAvatarMode, setAssistantAvatarMode] = useState('fixed')
  const [assistantAvatars, setAssistantAvatars] = useState([])
  const [enableDirectQuery, setEnableDirectQuery] = useState(true)
  const [lightboxImage, setLightboxImage] = useState(null)

  // 判斷是否為「找不到相關資料」的回覆
  const isNoResultsAnswer = (text) => {
    return text && text.includes('資料庫中沒有找到與您的問題相關的文檔')
  }

  // 處理「使用模型直接回覆」
  const handleDirectQuery = async (originalQuestion, messageId) => {
    setDirectQueryLoading(messageId)
    try {
      const response = await sendDirectQuery(originalQuestion)
      if (response.success) {
        const directAnswer = response.data.answer || '無法取得回覆'
        const usedExternal = response.data.used_external_api
        const label = usedExternal ? '（使用外部模型直接回覆）' : '（使用本地模型直接回覆）'
        const newMsg = {
          id: Date.now(),
          text: `${label}\n\n${directAnswer}`,
          sources: [],
          sender: 'ai',
          timestamp: new Date(),
          isDirectReply: true,
          avatarSrc: getCurrentAssistantAvatar()
        }
        setMessages(prev => [...prev, newMsg])
      } else {
        const isClientError = response.statusCode >= 400 && response.statusCode < 500
        const errMsg = {
          id: Date.now(),
          text: isClientError ? response.error : '抱歉，直接回覆失敗，請稍後再試。',
          sources: [],
          sender: 'ai',
          timestamp: new Date(),
          avatarSrc: getCurrentAssistantAvatar()
        }
        setMessages(prev => [...prev, errMsg])
      }
    } catch (error) {
      console.error('Direct query error:', error)
    } finally {
      setDirectQueryLoading(null)
    }
  }

  // 處理檔案下載
  const handleDownload = async (downloadLink, fileName) => {
    try {
      // downloadLink 格式: /public/files/{id}/download
      // 需要加上 /api 前綴
      const fullUrl = `${API_CONFIG.BASE_URL}${downloadLink}`
      const token = localStorage.getItem('query_token')
      const headers = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const response = await fetch(fullUrl, { headers })
      
      if (!response.ok) {
        throw new Error('下載失敗')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('下載失敗:', error)
      alert('檔案下載失敗，請稍後再試')
    }
  }

  const TRAILING_URL_PUNCTUATION = /[),.;!?\]}>，。；：、）】》」』]+$/
  const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\s*\((https?:\/\/[^\s)）]+)[)）]/gi
  const PLAIN_URL_REGEX = /(https?:\/\/[^\s<，。；：、（）「」『』《》【】]+|www\.[^\s<，。；：、（）「」『』《》【】]+)/gi

  const splitUrlSuffix = (value) => {
    const trailing = value.match(TRAILING_URL_PUNCTUATION)?.[0] || ''
    if (!trailing) {
      return { urlText: value, suffix: '' }
    }

    return {
      urlText: value.slice(0, -trailing.length),
      suffix: trailing
    }
  }


  const createUrlBadge = (href, key) => {
    const cleanHref = (href.startsWith('http') ? href : `https://${href}`).replace(/\\_/g, '_')
    return (
      <a
        key={key}
        href={cleanHref}
        title={cleanHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center w-5 h-5 mx-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 hover:border-red-400 transition-colors align-middle"
      >
        ↗
      </a>
    )
  }

  const renderPlainTextWithLinks = (text, keyPrefix) => {
    const parts = []
    let lastIndex = 0
    let matchIndex = 0

    for (const match of text.matchAll(PLAIN_URL_REGEX)) {
      const matchedText = match[0]
      const matchStart = match.index ?? 0

      if (matchStart > lastIndex) {
        parts.push(text.slice(lastIndex, matchStart))
      }

      const { urlText, suffix } = splitUrlSuffix(matchedText)

      if (urlText) {
        parts.push(createUrlBadge(urlText, `${keyPrefix}-url-${matchIndex}`))
      }

      if (suffix) {
        parts.push(suffix)
      }

      lastIndex = matchStart + matchedText.length
      matchIndex += 1
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
  }

  const renderMessageContent = (text) => {
    const elements = []
    let lastIndex = 0
    let matchIndex = 0

    for (const match of text.matchAll(MARKDOWN_LINK_REGEX)) {
      const [fullMatch, label, href] = match
      const matchStart = match.index ?? 0

      if (matchStart > lastIndex) {
        elements.push(...renderPlainTextWithLinks(text.slice(lastIndex, matchStart), `text-${matchIndex}`))
      }

      // label 保留為純文字，URL 一律顯示為 ↗ badge
      const isUrlLabel = /^https?:\/\//i.test(label.trim())
      if (!isUrlLabel) elements.push(label)
      elements.push(createUrlBadge(href, `md-${matchIndex}`))
      lastIndex = matchStart + fullMatch.length
      matchIndex += 1
    }

    if (lastIndex < text.length) {
      elements.push(...renderPlainTextWithLinks(text.slice(lastIndex), `tail-${matchIndex}`))
    }

    return <p className="text-gray-800 whitespace-pre-line">{elements}</p>
  }

  const fallbackAssistantAvatar = APP_CONSTANTS.UNIVERSITY.LOGO_PATH

  const pickRandomAvatar = (avatars) => {
    if (!avatars?.length) return null
    const index = Math.floor(Math.random() * avatars.length)
    return avatars[index]?.url || null
  }

  const getAvatarFromSettings = (settings) => {
    const avatars = settings?.assistant_avatars || []
    if (settings?.assistant_avatar_mode === 'random') {
      return pickRandomAvatar(avatars) || settings?.assistant_avatar || fallbackAssistantAvatar
    }
    return settings?.assistant_avatar || avatars[0]?.url || fallbackAssistantAvatar
  }

  const getCurrentAssistantAvatar = () => {
    if (assistantAvatarMode === 'random') {
      return pickRandomAvatar(assistantAvatars) || assistantAvatar || fallbackAssistantAvatar
    }
    return assistantAvatar || assistantAvatars[0]?.url || fallbackAssistantAvatar
  }

  const applyWelcomeSettings = (data) => {
    setAssistantName(data.assistant_name)
    setAssistantAvatar(data.assistant_avatar)
    setAssistantAvatarMode(data.assistant_avatar_mode || 'fixed')
    setAssistantAvatars(data.assistant_avatars || [])
    setEnableDirectQuery(data.enable_direct_query)
  }

  // 從後端獲取快速問題列表
  useEffect(() => {
    const fetchQuickQuestions = async () => {
      try {
        const response = await getQuickQuestions()
        if (response.success) {
          setQuickQuestions(response.data)
        } else {
          console.error('Failed to fetch quick questions:', response.error)
          setQuickQuestions([])
        }
      } catch (error) {
        console.error('Error fetching quick questions:', error)
        setQuickQuestions([])
      }
    }

    fetchQuickQuestions()
  }, [])

  // 獲取分類列表
  useEffect(() => {
    const fetchCategories = async () => {
      if (!department?.id) return
      
      try {
        const response = await getCategories(department.id)
        if (response.success && response.data?.items) {
          setCategories(response.data.items)
        } else {
          console.error('Failed to fetch categories:', response.error)
          setCategories([])
        }
      } catch (error) {
        console.error('Error fetching categories:', error)
        setCategories([])
      }
    }

    fetchCategories()
  }, [department])

  // 處理分類選擇
  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId) // 直接設定為選中的分類 ID，null 表示全部
  }

  // 獲取 AI 回覆
  const getAIResponse = async (question) => {
    try {
      // 傳遞選中的分類 ID（null 表示全部）
      const categoryIds = selectedCategory ? [selectedCategory] : null
      const response = await sendChatMessage(question, categoryIds)
      if (response.success) {
        // 後端 RAG API 返回格式：{ query, answer, sources, ... }
        return {
          text: response.data.answer || response.data.message || '無法取得回覆',
          sources: response.data.sources || []
        }
      } else {
        console.error('API Error:', response.error)
        // 4xx 為後端主動拒絕（如安全過濾），直接顯示後端訊息；5xx 才顯示通用錯誤
        const isClientError = response.statusCode >= 400 && response.statusCode < 500
        return {
          text: isClientError ? response.error : '抱歉，系統發生錯誤，請稍後再試。',
          sources: []
        }
      }
    } catch (error) {
      console.error('Error getting AI response:', error)
      return {
        text: '抱歉，系統發生錯誤，請稍後再試。',
        sources: []
      }
    }
  }

  // 滾動到最新訊息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 根據視窗大小自動顯示/隱藏側邊欄（行動裝置預設隱藏）
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setShowSidebar(true)
      else setShowSidebar(false)
    }

    // 初始檢查
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 處理從首頁帶來的問題
  useEffect(() => {
    const initializeChat = async () => {
      let welcomeData = null

      try {
        const response = await getWelcomeMessage()
        if (response.success) {
          welcomeData = response.data
          applyWelcomeSettings(welcomeData)
        }
      } catch (error) {
        console.error('Error fetching welcome settings:', error)
      }

      if (location.state?.question) {
        // 如果有問題，直接發送問題，不顯示歡迎訊息
        const userMessage = {
          id: Date.now(),
          text: location.state.question,
          sender: 'user',
          timestamp: new Date()
        }
        setMessages([userMessage])
        setIsTyping(true)

        try {
          const aiResponseData = await getAIResponse(location.state.question)
          const aiResponse = {
            id: Date.now() + 1,
            text: aiResponseData.text,
            sources: aiResponseData.sources,
            sender: 'ai',
            timestamp: new Date(),
            originalQuestion: location.state.question,
            avatarSrc: getAvatarFromSettings(welcomeData)
          }
          // 直接設置完整的訊息陣列，而不是使用 prev
          setMessages([userMessage, aiResponse])
        } catch (error) {
          console.error('Error in initializeChat:', error)
          const errorResponse = {
            id: Date.now() + 1,
            text: '抱歉，系統發生錯誤，請稍後再試。',
            sources: [],
            sender: 'ai',
            timestamp: new Date(),
            avatarSrc: getAvatarFromSettings(welcomeData)
          }
          // 直接設置完整的訊息陣列，而不是使用 prev
          setMessages([userMessage, errorResponse])
        } finally {
          setIsTyping(false)
        }
      } else {
        // 沒有問題時，從後端獲取初始歡迎訊息
        if (welcomeData) {
          setMessages([{
            id: 1,
            text: welcomeData.message,
            sender: 'ai',
            timestamp: new Date(),
            isGreeting: true,
            greetingImage: welcomeData.greeting_image,
            avatarSrc: getAvatarFromSettings(welcomeData)
          }])
        } else {
          setMessages([{
            id: 1,
            text: '您好！我是 AI 助手 👋\n\n我可以協助您查詢相關文檔和資訊。請問有什麼我可以幫助您的嗎？',
            sender: 'ai',
            timestamp: new Date(),
            isGreeting: true,
            avatarSrc: fallbackAssistantAvatar
          }])
        }
      }
    }

    initializeChat()
  }, [])

  const handleSendMessage = async (messageText = inputMessage) => {
    if (!messageText.trim()) return

    const userMessage = {
      id: Date.now(),
      text: messageText,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsTyping(true)

    // 呼叫後端 API 獲取 AI 回覆
    try {
      const aiResponseData = await getAIResponse(messageText)
      
      const aiResponse = {
        id: Date.now() + 1,
        text: aiResponseData.text,
        sources: aiResponseData.sources,
        sender: 'ai',
        timestamp: new Date(),
        originalQuestion: messageText,
        avatarSrc: getCurrentAssistantAvatar()
      }
      
      setMessages(prev => [...prev, aiResponse])
    } catch (error) {
      console.error('Error in handleSendMessage:', error)
      // 錯誤處理
      const errorResponse = {
        id: Date.now() + 1,
        text: '抱歉，系統發生錯誤，請稍後再試。',
        sources: [],
        sender: 'ai',
        timestamp: new Date(),
        avatarSrc: getCurrentAssistantAvatar()
      }
      setMessages(prev => [...prev, errorResponse])
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickQuestion = (question) => {
    handleSendMessage(question)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleNewChat = async () => {
    try {
      const response = await getWelcomeMessage()
      if (response.success) {
        applyWelcomeSettings(response.data)
        setMessages([{
          id: Date.now(),
          text: response.data.message,
          sender: 'ai',
          timestamp: new Date(),
          isGreeting: true,
          greetingImage: response.data.greeting_image,
          avatarSrc: getAvatarFromSettings(response.data)
        }])
      }
    } catch (error) {
      console.error('Error in handleNewChat:', error)
      setMessages([{
        id: Date.now(),
        text: '已開始新對話！有什麼我可以幫助您的嗎？',
        sender: 'ai',
        timestamp: new Date(),
        isGreeting: true,
        avatarSrc: getCurrentAssistantAvatar()
      }])
    }
  }

  const getDisplayName = () => {
    return user?.full_name || user?.name || user?.username || '使用者'
  }

  const handleLogout = () => {
    logout()
    navigate(deptSlug ? `/${deptSlug}` : '/', { replace: true })
  }

  const assistantDisplayAvatar = assistantAvatar || assistantAvatars[0]?.url || fallbackAssistantAvatar

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-white via-red-50 to-white flex overflow-hidden">
        {/* 側邊欄（行動裝置為覆蓋式滑入） */}
        <div
          className={`fixed z-40 top-0 h-full transition-all w-64 bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col overflow-hidden shadow-lg`}
          style={{ left: showSidebar ? 0 : '-16rem' }}
        >
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-all shadow-md cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>新對話</span>
          </button>
        </div>

        {/* 快速問題 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">快速問題</h3>
          <div className="space-y-2">
            {quickQuestions.map((item) => (
              <button
                key={item.id || item.question}
                onClick={() => handleQuickQuestion(item.question)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                {item.icon && <span className="text-lg">{item.icon}</span>}
                <span>{item.question}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 使用說明 */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <div className="text-xs text-gray-500 space-y-1">
            <p className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              24/7 全天候服務
            </p>
            <p className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              安全加密對話
            </p>
          </div>
        </div>
      </div>

      {/* 行動遮罩（點擊可關閉側邊欄） */}
      {showSidebar && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setShowSidebar(false)} />
      )}

      {/* 主聊天區域 */}
      <div className={`flex-1 flex flex-col h-full transition-all ${showSidebar ? 'md:ml-64' : ''}`}>
        {/* 頂部導航欄 */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 p-4 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-200 p-1">
                  <img 
                    src={fallbackAssistantAvatar}
                    alt={APP_CONSTANTS.UNIVERSITY.NAME}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-gray-800 font-semibold">{assistantName || APP_CONSTANTS.APP_NAME}</h2>
                  <p className="text-sm text-gray-500">線上服務中</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm sm:text-base">
              <span className="max-w-[10rem] sm:max-w-xs truncate font-medium text-gray-700" title={getDisplayName()}>
                {getDisplayName()}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                登出
              </button>
            </div>
          </div>
        </div>

        {/* 訊息區域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div className={`flex gap-3 max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* 頭像 */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.sender === 'user' 
                    ? 'bg-gradient-to-r from-gray-500 to-gray-600' 
                    : 'bg-white border border-gray-200 overflow-hidden'
                }`}>
                  {message.sender === 'user' ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  ) : (
                    <img 
                      src={message.avatarSrc || assistantDisplayAvatar}
                      alt={APP_CONSTANTS.UNIVERSITY.NAME}
                      className="w-full h-full rounded-full object-cover"
                    />
                  )}
                </div>

                {/* 訊息內容 */}
                <div className={`rounded-2xl px-4 py-3 shadow-md ${
                  message.sender === 'user'
                    ? 'bg-red-100 border border-red-200'
                    : 'bg-white border border-gray-200'
                }`}>
                  {message.sender === 'ai' ? 
                    renderMessageContent(message.text) :
                    <p className="text-gray-800 whitespace-pre-line">{message.text}</p>
                  }
                  
                  {/* 參考資料區塊（僅 AI 訊息） */}
                  {message.sender === 'ai' && message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        參考資料（{message.sources.length} 份文件）
                      </p>
                      <div className="space-y-2">
                        {message.sources.map((source, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-800 mr-1">文檔{source.doc_num}</span>
                            <span className="text-sm text-gray-700 flex-1">{source.file_name}</span>
                            {source.download_link && (
                              <button
                                onClick={() => handleDownload(source.download_link, source.file_name)}
                                className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors whitespace-nowrap flex items-center gap-1"
                                title="下載檔案"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                下載
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-2">
                    {message.timestamp.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {/* 歡迎圖片 */}
                  {message.isGreeting && message.greetingImage && (
                    <div className="mt-3">
                      <img
                        src={message.greetingImage}
                        alt="歡迎圖片"
                        className="max-w-sm max-h-64 rounded-lg object-contain cursor-zoom-in"
                        onClick={() => setLightboxImage(message.greetingImage)}
                      />
                    </div>
                  )}

                  {/* AI 回覆顯示「改以 AI 通用知識回答」按鈕（問候語除外） */}
                  {enableDirectQuery && message.sender === 'ai' && !message.isDirectReply && !message.isGreeting && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => {
                          const q = message.originalQuestion ||
                            [...messages].reverse().find(m => m.sender === 'user' && m.id < message.id)?.text
                          if (q) handleDirectQuery(q, message.id)
                        }}
                        disabled={directQueryLoading === message.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {directQueryLoading === message.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            <span>模型思考中...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303-5.303l-.347.347a5 5 0 010 7.072z" />
                            </svg>
                            <span>改以 AI 通用知識回答（僅供參考）</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 正在輸入指示器 */}
          {isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-3 max-w-3xl">
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                  <img 
                    src={assistantDisplayAvatar}
                    alt={APP_CONSTANTS.UNIVERSITY.NAME}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-md">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 輸入區域 */}
        <div className="border-t border-gray-200 p-4 bg-white/80 backdrop-blur-sm flex-shrink-0 shadow-lg">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              {/* 分類下拉選單 */}
              {categories.length > 0 && (
                <div className="relative w-14 sm:w-auto">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-600 font-medium hidden sm:block">
                    查詢範圍
                  </label>
                    <select
                      value={selectedCategory || ''}
                      onChange={(e) => handleCategoryChange(e.target.value ? parseInt(e.target.value) : null)}
                      className="appearance-none bg-white border-2 border-gray-300 rounded-xl pl-3 sm:pl-10 pr-3 sm:pr-10 h-12 text-sm font-medium focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 cursor-pointer w-full sm:min-w-[160px] hover:border-gray-400 transition-all truncate text-center sm:text-left text-transparent sm:text-gray-800"
                    >
                    <option value="" style={{ color: '#111827' }}>全部分類</option>
                    {categories
                      .sort((a, b) => {
                        // 將「其他」排在最後
                        if (a.name === '其他') return 1;
                        if (b.name === '其他') return -1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((category) => (
                        <option key={category.id} value={category.id} style={{ color: '#111827' }}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 sm:pl-3 text-gray-500">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-3 text-gray-500">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}
              
              {/* 附加檔案按鈕已移除，保留空間給選單與輸入欄 */}
              <div className="flex-1">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="輸入您的問題..."
                  rows="1"
                  maxLength={700}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 resize-none"
                />
              </div>
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim()}
                className="px-4 sm:px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all shadow-md cursor-pointer flex items-center justify-center"
                title="發送"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-xs text-gray-500">按 Enter 發送訊息，Shift + Enter 換行</p>
              {inputMessage.length > 600 && (
                <span className={`text-xs font-medium transition-colors ${inputMessage.length >= 700 ? 'text-red-500' : 'text-amber-500'}`}>
                  {inputMessage.length} / 700
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* 圖片放大燈箱 */}
    {lightboxImage && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        onClick={() => setLightboxImage(null)}
      >
        <img
          src={lightboxImage}
          alt="歡迎圖片"
          className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
        />
      </div>
    )}
    </>
  )
}

export default ChatPage

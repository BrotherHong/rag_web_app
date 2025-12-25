import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getQuickQuestions, sendChatMessage, getWelcomeMessage, getCategories } from '../services/api'
import { useDepartment } from '../contexts/DepartmentContext'
import { API_CONFIG, APP_CONSTANTS, PathUtils } from '../config/constants'

function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { department, deptSlug } = useDepartment()
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [quickQuestions, setQuickQuestions] = useState([])
  const [expandedSource, setExpandedSource] = useState({})
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null) // null 表示「全部」

  // 處理檔案下載
  const handleDownload = async (downloadLink, fileName) => {
    try {
      // downloadLink 格式: /public/files/{id}/download
      // 需要加上 /api 前綴
      const fullUrl = `${API_CONFIG.BASE_URL}${downloadLink}`
      const response = await fetch(fullUrl)
      
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

  // 渲染消息內容（移除引用部分）
  const renderMessageContent = (text) => {
    // 分離主要回答和引用部分
    const parts = text.split(/引用[：:]\s*\n/)
    const mainAnswer = parts[0].trim()
    return <p className="text-gray-800 whitespace-pre-line">{mainAnswer}</p>
  }

  // 解析引用內容並按檔名分組
  const parseCitations = (text, sources) => {
    if (!sources || sources.length === 0) return []

    const parts = text.split(/引用[：:]\s*\n/)
    if (parts.length < 2) return []

    const citationsText = parts[1]
    const citationLines = citationsText.split('\n').filter(line => line.trim())
    
    const fileMap = {}
    sources.forEach(source => {
      fileMap[source.file_name] = source
    })

    // 先解析所有引用
    const allCitations = []
    citationLines.forEach(line => {
      const match = line.match(/文檔(\d+)[（(](.+?)[）)][:：](.+)/)
      if (match) {
        const [, docNum, fileName, content] = match
        allCitations.push({
          docNum,
          fileName,
          content: content.trim().replace(/^「|」$/g, '')
        })
      }
    })

    // 按檔名分組合併
    const groupedByFile = {}
    allCitations.forEach(citation => {
      if (!groupedByFile[citation.fileName]) {
        groupedByFile[citation.fileName] = {
          docNum: citation.docNum,
          fileName: citation.fileName,
          source: fileMap[citation.fileName],
          contents: []
        }
      }
      groupedByFile[citation.fileName].contents.push(citation.content)
    })

    return Object.values(groupedByFile)
  }

  // 切換展開/收合
  const toggleSource = (messageId, fileName) => {
    setExpandedSource(prev => ({
      ...prev,
      [messageId]: prev[messageId] === fileName ? null : fileName
    }))
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
        return {
          text: '抱歉，系統發生錯誤，請稍後再試。',
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

  // 處理從首頁帶來的問題
  useEffect(() => {
    const initializeChat = async () => {
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
            timestamp: new Date()
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
            timestamp: new Date()
          }
          // 直接設置完整的訊息陣列，而不是使用 prev
          setMessages([userMessage, errorResponse])
        } finally {
          setIsTyping(false)
        }
      } else {
        // 沒有問題時，從後端獲取初始歡迎訊息
        try {
          const response = await getWelcomeMessage()
          if (response.success) {
            setMessages([{
              id: 1,
              text: response.data.message,
              sender: 'ai',
              timestamp: new Date()
            }])
          }
        } catch (error) {
          console.error('Error fetching welcome message:', error)
          // 使用預設歡迎訊息
          setMessages([{
            id: 1,
            text: '您好！我是人事室 AI 助手 👋\n\n我可以協助您處理各種人事相關問題。請問有什麼我可以幫助您的嗎？',
            sender: 'ai',
            timestamp: new Date()
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
        timestamp: new Date()
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
        timestamp: new Date()
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
    // 獲取新的歡迎訊息
    try {
      const response = await getWelcomeMessage()
      if (response.success) {
        setMessages([{
          id: Date.now(),
          text: '已開始新對話！\n\n' + response.data.message,
          sender: 'ai',
          timestamp: new Date()
        }])
      } else {
        setMessages([{
          id: Date.now(),
          text: '已開始新對話！有什麼我可以幫助您的嗎？',
          sender: 'ai',
          timestamp: new Date()
        }])
      }
    } catch (error) {
      console.error('Error in handleNewChat:', error)
      setMessages([{
        id: Date.now(),
        text: '已開始新對話！有什麼我可以幫助您的嗎？',
        sender: 'ai',
        timestamp: new Date()
      }])
    }
  }

  return (
    <div className="h-screen bg-gradient-to-br from-white via-red-50 to-white flex overflow-hidden">
      {/* 側邊欄 */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} transition-all duration-300 bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col overflow-hidden shadow-lg`}>
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => navigate(`/${deptSlug}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-red-600 transition-colors mb-4 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>返回首頁</span>
          </button>
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

      {/* 主聊天區域 */}
      <div className="flex-1 flex flex-col h-full">
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
                    src={APP_CONSTANTS.UNIVERSITY.LOGO_PATH}
                    alt={APP_CONSTANTS.UNIVERSITY.NAME}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-gray-800 font-semibold">{department ? department.name + ' AI助手' : APP_CONSTANTS.APP_NAME}</h2>
                  <p className="text-sm text-gray-500">線上服務中</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" title="匯出對話">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" title="更多選項">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
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
                    : 'bg-white border border-gray-200 p-1'
                }`}>
                  {message.sender === 'user' ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  ) : (
                    <img 
                      src={APP_CONSTANTS.UNIVERSITY.LOGO_PATH}
                      alt={APP_CONSTANTS.UNIVERSITY.NAME}
                      className="w-full h-full object-contain"
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
                  {message.sender === 'ai' && message.sources && message.sources.length > 0 && (() => {
                    const citations = parseCitations(message.text, message.sources)
                    return citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                          </svg>
                          參考資料（{citations.length} 份文件）
                        </p>
                        <div className="space-y-2">
                          {citations.map((citation, idx) => {
                            const isExpanded = expandedSource[message.id] === citation.fileName
                            return (
                              <div key={idx}>
                                <div className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                                  <button
                                    onClick={() => toggleSource(message.id, citation.fileName)}
                                    className="flex items-center gap-2 flex-1 text-left"
                                  >
                                    <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-sm font-medium text-gray-800 mr-1">文檔{citation.docNum}</span>
                                    <span className="text-sm text-gray-700">{citation.fileName}</span>
                                  </button>
                                  {citation.source && citation.source.download_link && (
                                    <button
                                      onClick={() => handleDownload(citation.source.download_link, citation.source.file_name)}
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
                                {isExpanded && (
                                  <div className="ml-6 mt-1 space-y-2">
                                    {citation.contents.map((content, contentIdx) => (
                                      <div key={contentIdx} className="p-2 bg-gray-50 rounded text-xs text-gray-700 leading-relaxed">
                                        「{content}」
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                  
                  <p className="text-xs text-gray-500 mt-2">
                    {message.timestamp.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* 正在輸入指示器 */}
          {isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex gap-3 max-w-3xl">
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center p-1">
                  <img 
                    src={APP_CONSTANTS.UNIVERSITY.LOGO_PATH}
                    alt={APP_CONSTANTS.UNIVERSITY.NAME}
                    className="w-full h-full object-contain"
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
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-600 font-medium">
                    查詢範圍
                  </label>
                  <select
                    value={selectedCategory || ''}
                    onChange={(e) => handleCategoryChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="appearance-none bg-white border-2 border-gray-300 rounded-xl pl-10 pr-10 py-3.5 text-sm text-gray-800 font-medium focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 cursor-pointer min-w-[160px] hover:border-gray-400 transition-colors"
                  >
                    <option value="">全部分類</option>
                    {categories
                      .sort((a, b) => {
                        // 將「其他」排在最後
                        if (a.name === '其他') return 1;
                        if (b.name === '其他') return -1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}
              
              <button className="p-3 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0" title="附加檔案">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="輸入您的問題..."
                  rows="1"
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 resize-none"
                />
              </div>
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim()}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all shadow-md cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              按 Enter 發送訊息，Shift + Enter 換行
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatPage

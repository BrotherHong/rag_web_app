// 假資料 - 模擬後端 API 回應
// 在實際對接後端時，這些資料將被後端 API 取代
// 注意：現在 FAQ 和快速問題已合併，都使用同一個端點 /api/faq/list

// 常見問題列表（模擬 GET /api/faq/list 的回應）
// 首頁使用 limit=4 只顯示前 4 個，聊天頁獲取完整列表
export const mockFaqList = [
  {
    id: 1,
    category: '基本操作',
    question: '如何上傳文件？',
    description: '了解文件上傳流程與支援格式',
    answer: '請點擊上傳按鈕，選擇您的文件，系統支援 PDF、Word 和 TXT 格式。',
    icon: '📄',
    order: 1
  },
  {
    id: 2,
    category: '基本操作',
    question: '如何進行查詢？',
    description: '學習使用 AI 智能查詢功能',
    answer: '在搜尋框中輸入您的問題，系統會自動搜尋相關文檔並提供答案。',
    icon: '🔍',
    order: 2
  },
  {
    id: 3,
    category: '系統功能',
    question: '系統支援哪些文件格式？',
    description: '查看支援的文件類型',
    answer: '系統支援 PDF、Word（.docx）和純文字（.txt）格式的文件。',
    icon: '📋',
    order: 3
  },
  {
    id: 4,
    category: '系統功能',
    question: '如何查看歷史查詢？',
    description: '檢視過去的查詢記錄',
    answer: '登入後，您可以在「歷史記錄」頁面查看過去的查詢記錄。',
    icon: '🕒',
    order: 4
  },
  {
    id: 5,
    category: '人事相關',
    question: '請假規定是什麼？',
    description: '了解各類假別申請規定',
    answer: '請參考人事室官網的請假規定，或詢問您的主管。',
    icon: '📅',
    order: 5
  },
  {
    id: 6,
    category: '人事相關',
    question: '如何申請加班費？',
    description: '加班申請與核銷流程說明',
    answer: '請填寫加班申請單，經主管核准後送人事室辦理。',
    icon: '💰',
    order: 6
  },
  {
    id: 7,
    category: '人事相關',
    question: '年假天數如何計算？',
    description: '年度特休假額度計算方式',
    answer: '依據勞基法規定，年資滿一年享有特休假，天數依年資而定。',
    icon: '📆',
    order: 7
  },
  {
    id: 8,
    category: '人事相關',
    question: '出差申請流程？',
    description: '國內外出差申請步驟',
    answer: '請填寫出差申請單，經主管核准後送人事室備查。',
    icon: '✈️',
    order: 8
  },
]

// 快速問題列表已廢棄，現在使用 mockFaqList
// 保留此導出以避免破壞現有代碼
export const mockQuickQuestions = mockFaqList.map(faq => ({
  id: faq.id,
  question: faq.question,
  category: faq.category,
  icon: faq.icon
}))

// AI 回覆資料庫（模擬 POST /api/chat/send 的回應）
export const mockAIResponses = {
  '如何查詢我的請假紀錄？': {
    success: true,
    data: {
      message: '您可以透過以下步驟查詢請假紀錄：\n\n1. 登入人事系統\n2. 點擊「個人資料」選單\n3. 選擇「請假管理」\n4. 即可查看完整的請假歷史紀錄及剩餘額度\n\n如需進一步協助，請提供您的員工編號，我會為您查詢詳細資訊。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_001',
    }
  },
  '薪資單何時會發放？': {
    success: true,
    data: {
      message: '薪資發放時間如下：\n\n📅 每月5日發放上個月薪資\n💰 如遇假日則提前至最近的工作日\n📧 薪資單會在發放日前一天以Email寄送\n\n您可以在人事系統的「薪資查詢」區查看歷史薪資明細。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_002',
    }
  },
  '如何申請加班費？': {
    success: true,
    data: {
      message: '加班費申請流程：\n\n1. 事前填寫加班申請單\n2. 經主管核准後執行加班\n3. 加班結束後於系統登記時數\n4. 每月10日前完成申請\n5. 隔月與薪資一併發放\n\n注意：未經核准的加班恕不予計算。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_003',
    }
  },
  '如何更新個人聯絡資訊？': {
    success: true,
    data: {
      message: '更新聯絡資訊步驟：\n\n1. 登入人事系統\n2. 進入「個人資料維護」\n3. 更新電話、地址等資訊\n4. 送出後等待人事室審核\n5. 審核通過後即完成更新\n\n如需緊急更改，請直接聯繫人事室。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_004',
    }
  },
  '年度考核時間及流程？': {
    success: true,
    data: {
      message: '年度考核相關資訊：\n\n📋 考核時間：每年12月\n📝 考核項目：工作表現、專業能力、團隊合作\n⭐ 評等：優等、甲等、乙等、丙等\n🎯 獎懲：影響年終獎金及升遷\n\n詳細評核表將於11月發送至各部門。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_005',
    }
  },
  '忘記員工系統密碼怎麼辦？': {
    success: true,
    data: {
      message: '密碼重設方式：\n\n方法一：自助重設\n1. 點擊登入頁面的「忘記密碼」\n2. 輸入員工編號和註冊Email\n3. 收取驗證碼並重設密碼\n\n方法二：聯繫IT部門\n📞 分機：1234\n📧 Email: it@company.com\n\n建議定期更換密碼以確保帳號安全。',
      timestamp: new Date().toISOString(),
      messageId: 'msg_006',
    }
  },
}

// 預設 AI 回覆（當問題不在資料庫中時）
export const mockDefaultResponse = {
  success: true,
  data: {
    message: '感謝您的詢問。\n\n我已收到您的問題，正在為您查詢相關資訊。這個問題可能需要人工處理，我們會盡快為您提供詳細的答覆。\n\n如有緊急需求，請直接撥打人事室專線：(06) 275-7575 分機 50200。',
    timestamp: new Date().toISOString(),
    messageId: 'msg_default',
  }
}

// 歡迎訊息（模擬 GET /api/system/info 的回應）
export const mockWelcomeMessage = {
  success: true,
  data: {
    message: '您好！我是人事室 AI 助手 👋\n\n我可以協助您處理各種人事相關問題，例如：\n• 請假查詢\n• 薪資問題\n• 加班申請\n• 個人資料更新\n• 考核相關\n\n請問有什麼我可以幫助您的嗎？',
    timestamp: new Date().toISOString(),
    features: [
      '24/7 全天候服務',
      '安全加密對話',
      '即時回應',
    ],
  }
}

// 系統資訊
export const mockSystemInfo = {
  success: true,
  data: {
    appName: '人事室AI助手',
    version: '1.0.0',
    status: 'online',
    lastUpdate: '2025-10-16',
  }
}

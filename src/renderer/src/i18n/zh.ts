import type { en } from './en'

export const zh: typeof en = {
  // App
  'app.title': 'CS2 精彩时刻剪辑器',

  // ErrorBoundary
  'error.title': '出现错误',
  'error.message': '发生了意外错误',
  'error.tryAgain': '重试',
  'error.reloadApp': '重新加载',

  // SidebarNav
  'nav.home': '首页',
  'nav.project': '项目',
  'nav.recording': '录制',
  'nav.editor': '编辑器',
  'nav.export': '导出',
  'nav.settings': '设置',
  'nav.logo': 'CS2 剪辑器',
  'nav.currentProject': '当前项目',

  // WelcomePage
  'welcome.title': 'CS2 精彩时刻剪辑器',
  'welcome.description': '自动检测 CS2 Demo 文件中的精彩时刻，生成视频片段。',
  'welcome.dropHere': '将 {ext} 文件拖放到此处',
  'welcome.orClick': '或点击浏览文件',
  'welcome.parsing': '正在解析 Demo 文件...',
  'welcome.supports': '支持 CS2 Demo 文件 (.dem) — 匹配赛、Wingman、FACEIT',
  'welcome.importVideo': '或导入视频文件进行编辑',
  'welcome.error.notDem': '请选择 .dem 文件',
  'welcome.error.parseFailed': '解析 Demo 文件失败',
  'welcome.error.dialogFailed': '打开文件对话框失败',
  'welcome.error.videoFailed': '打开视频文件失败',
  'welcome.error.unknownDemo': '未知 Demo',
  'welcome.error.unknownVideo': '未知视频',

  // ProjectPage
  'project.noDemo': '未加载 Demo，请先打开 Demo 文件。',
  'project.tick': '{rate} tick',
  'project.players': '{count} 名玩家',
  'project.close': '关闭',
  'project.recordTooltip': '录制功能将在 Phase 2 实现',
  'project.recordHighlights': '录制精彩时刻',
  'project.highlightsFound': '找到 {count} 个精彩时刻',
  'project.filters': '筛选',
  'project.sort': '排序：',
  'project.sort.score': '分数',
  'project.sort.round': '回合',
  'project.sort.type': '类型',
  'project.player': '玩家',
  'project.allPlayers': '全部玩家',
  'project.type': '类型',
  'project.noHighlights': '没有匹配筛选条件的精彩时刻',
  'project.roundKill': '第 {round} 回合 {count} 杀{hs}',

  // SettingsPage
  'settings.title': '设置',
  'settings.cs2Install': 'CS2 安装路径',
  'settings.cs2Description': '将自动从 Steam 注册表检测 CS2 路径，也可手动覆盖。',
  'settings.cs2Placeholder': '自动检测...',
  'settings.browse': '浏览',
  'settings.obsWebSocket': 'OBS WebSocket',
  'settings.obsDescription': '通过 WebSocket 连接 OBS Studio 进行自动录制。',
  'settings.host': '主机',
  'settings.port': '端口',
  'settings.password': '密码（可选）',
  'settings.passwordPlaceholder': '无密码请留空',
  'settings.testConnection': '测试连接',
  'settings.recording': '录制',
  'settings.preRoll': '前导填充（精彩时刻前的秒数）',
  'settings.postRoll': '后续填充（精彩时刻后的秒数）',
  'settings.about': '关于',
  'settings.version': 'CS2 精彩时刻剪辑器 v1.0.0',
  'settings.aboutDescription': '自动检测 CS2 Demo 文件中的精彩时刻。',
  'settings.language': '语言',

  // RecordingPage
  'recording.title': '录制',
  'recording.description': 'CS2 + OBS 录制管线将在 Phase 2 中提供。',
  'recording.subDescription': '此功能需要 CS2 和 OBS Studio 并启用 WebSocket。',

  // EditorPage
  'editor.unknownVideo': '未知视频',
  'editor.videoFailed': '打开视频文件失败',
  'editor.noVideo': '未加载视频',
  'editor.importPrompt': '导入视频文件开始编辑。',
  'editor.importVideo': '导入视频',
  'editor.backHome': '返回首页',

  // ExportPage
  'export.preparing': '正在准备导出...',
  'export.failed': '导出失败',
  'export.exporting': '正在导出...',
  'export.processing': '处理中...',
  'export.step': '步骤 {current}/{total}',
  'export.eta': '剩余时间：{eta}',
  'export.cancel': '取消',
  'export.complete': '导出完成',
  'export.success': '视频导出成功',
  'export.showInExplorer': '在资源管理器中显示',
  'export.exportAgain': '再次导出',
  'export.cancelled': '导出已取消',
  'export.exportFailed': '导出失败',
  'export.tryAgain': '重试',
  'export.title': '导出',
  'export.settings': '设置',
  'export.settingsTitle': '导出设置',
  'export.format': '格式',
  'export.videoCodec': '视频编码',
  'export.quality': '质量 (CRF: {crf})',
  'export.higherQuality': '更高质量',
  'export.smallerFile': '更小文件',
  'export.resolution': '分辨率',
  'export.source': '原始',
  'export.audioBitrate': '音频码率',
  'export.clips': '片段 ({count})',
  'export.noClips': '时间线上没有片段，请前往编辑器添加。',
  'export.totalDuration': '总时长：',
  'export.audioTracks': '音轨 ({count})',
  'export.vol': '音量：{percent}%',
  'export.exportVideo': '导出视频',

  // AudioTrackPanel
  'editor.audioTracks': '音频轨道',
  'editor.importAudio': '导入音频',
  'editor.noAudioTracks': '暂无音频轨道，导入音频可与视频混合。',
  'editor.removeAudio': '移除',

  // ClipEditor
  'clipEditor.inButton': '入点 [I]',
  'clipEditor.outButton': '出点 [O]',
  'clipEditor.frameBack': '-1 帧',
  'clipEditor.frameForward': '+1 帧',
  'clipEditor.goToIn': '跳转到入点',
  'clipEditor.goToOut': '跳转到出点',
  'clipEditor.preview': '预览',
  'clipEditor.addToTimeline': '添加到时间线',

  // Timeline
  'timeline.noClips': '时间线上没有片段，请使用上方裁剪控件添加。',
  'timeline.title': '时间线',
  'timeline.clipCount': '{count} 个片段 — {duration}',
  'timeline.clipLabel': '片段 {index}',

  // ClipInspector
  'clipInspector.title': '片段属性',
  'clipInspector.noSelection': '点击时间线上的片段查看属性',
  'clipInspector.clipLabel': '片段 {index}',
  'clipInspector.startPoint': '入点',
  'clipInspector.endPoint': '出点',
  'clipInspector.duration': '时长',
  'clipInspector.volume': '音量',
  'clipInspector.goToStart': '跳转到入点',
  'clipInspector.goToEnd': '跳转到出点',
  'clipInspector.deselect': '取消选中',

  // Settings persistence
  'settings.saved': '设置已保存',
  'settings.reset': '重置设置',
  'settings.resetConfirm': '确定要将所有设置恢复为默认值吗？',
  'settings.loading': '正在加载设置...',
  'settings.error': '加载设置失败',
  'settings.retry': '重试',

  // Toast notifications
  'toast.success': '成功',
  'toast.error': '错误',
  'toast.warning': '警告',
  'toast.info': '提示',

  // Common
  'common.clip': '个片段',
  'common.clips': '个片段',
  'common.cancel': '取消',
}

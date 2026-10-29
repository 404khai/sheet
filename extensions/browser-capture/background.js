// Reject screenshots if the user changes tabs or navigates while pixels are in flight.
let tabEpoch = 0
chrome.tabs.onActivated.addListener(() => { tabEpoch += 1 })
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.status === 'loading') tabEpoch += 1 })

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
    await chrome.action.setTitle({ tabId: tab.id, title: 'Capture a section for Sheet' })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' })
    await chrome.action.setTitle({ tabId: tab.id, title: 'Open an ordinary HTTP/HTTPS page, then try again. Browser internal pages cannot be captured.' })
  }
})

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'sheet-capture-pixels' || !sender.tab || sender.frameId !== 0) return
  const epoch = tabEpoch
  // Only the tab the person invoked may request its own visible pixels.
  chrome.tabs.query({ active: true, windowId: sender.tab.windowId }).then(async ([active]) => {
    if (active?.id !== sender.tab.id) throw new Error('Return to the selected tab and try again.')
    const data = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
    if (epoch !== tabEpoch) throw new Error('The tab changed during capture. Try again.')
    return data
  }).then((data) => respond({ data }), (error) => respond({ error: error.message }))
  return true
})

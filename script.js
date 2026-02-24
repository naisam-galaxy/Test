const STORAGE_KEY = 'amazonPpcCampaigns';
let campaigns = loadCampaigns();
let activeKeywordCampaignId = null;

const form = document.getElementById('campaign-form');
const campaignList = document.getElementById('campaign-list');
const clearDataBtn = document.getElementById('clear-data');
const keywordDialog = document.getElementById('keyword-dialog');
const keywordText = document.getElementById('keyword-text');
const saveKeywordsBtn = document.getElementById('save-keywords');
const template = document.getElementById('campaign-template');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = getFormData();
  if (data.id) {
    const idx = campaigns.findIndex((campaign) => campaign.id === data.id);
    campaigns[idx] = { ...campaigns[idx], ...data, updatedAt: new Date().toISOString() };
  } else {
    campaigns.unshift({
      ...data,
      id: crypto.randomUUID(),
      keywordList: [],
      optimizationHistory: [],
      createdAt: new Date().toISOString()
    });
  }

  form.reset();
  document.getElementById('reminderDays').value = 7;
  form.dataset.editId = '';
  saveCampaigns();
  renderCampaigns();
});

clearDataBtn.addEventListener('click', () => {
  if (!confirm('Delete all campaigns and history?')) return;
  campaigns = [];
  saveCampaigns();
  renderCampaigns();
});

saveKeywordsBtn.addEventListener('click', (event) => {
  event.preventDefault();
  if (!activeKeywordCampaignId) return;
  const list = keywordText.value
    .split('\n')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const campaign = campaigns.find((item) => item.id === activeKeywordCampaignId);
  if (!campaign) return;
  campaign.keywordList = list;
  campaign.updatedAt = new Date().toISOString();
  saveCampaigns();
  renderCampaigns();
  keywordDialog.close();
});

function getFormData() {
  const field = (id) => document.getElementById(id).value.trim();
  return {
    id: form.dataset.editId || null,
    campaignName: field('campaignName'),
    createdDate: field('createdDate'),
    adType: field('adType'),
    matchType: field('matchType'),
    category: field('category'),
    asinList: field('asinList'),
    budget: Number(field('budget')),
    placements: field('placements'),
    reminderDays: Number(field('reminderDays'))
  };
}

function renderCampaigns() {
  campaignList.innerHTML = '';
  if (campaigns.length === 0) {
    campaignList.innerHTML = '<p>No campaigns added yet.</p>';
    return;
  }

  campaigns.forEach((campaign) => {
    const clone = template.content.cloneNode(true);
    const root = clone.querySelector('.campaign-item');

    clone.querySelector('.campaign-title').textContent = campaign.campaignName;
    clone.querySelector('.meta').innerHTML = `
      <div><strong>Created:</strong> ${campaign.createdDate}</div>
      <div><strong>Ad Type:</strong> ${campaign.adType}</div>
      <div><strong>Match Type:</strong> ${campaign.matchType}</div>
      <div><strong>Category:</strong> ${campaign.category}</div>
      <div><strong>Model ASIN:</strong> ${campaign.asinList}</div>
      <div><strong>Budget:</strong> $${campaign.budget.toFixed(2)}</div>
      <div><strong>Placements:</strong> ${campaign.placements}</div>
      <div><strong>Keyword Count:</strong> ${campaign.keywordList?.length || 0}</div>
    `;

    const reminderMessage = getReminderMessage(campaign.createdDate, campaign.reminderDays);
    clone.querySelector('.reminder').textContent = reminderMessage;

    const historyList = clone.querySelector('.history-list');
    if (!campaign.optimizationHistory || campaign.optimizationHistory.length === 0) {
      historyList.innerHTML = '<li>No optimization history yet.</li>';
    } else {
      historyList.innerHTML = campaign.optimizationHistory
        .map((date) => `<li>${date}</li>`)
        .join('');
    }

    clone.querySelector('.keyword-btn').addEventListener('click', () => openKeywordSheet(campaign.id));
    clone.querySelector('.edit-btn').addEventListener('click', () => startEdit(campaign));

    const historyDate = clone.querySelector('.optimization-date');
    clone.querySelector('.add-history').addEventListener('click', () => {
      if (!historyDate.value) return;
      campaign.optimizationHistory = campaign.optimizationHistory || [];
      campaign.optimizationHistory.push(historyDate.value);
      campaign.updatedAt = new Date().toISOString();
      saveCampaigns();
      renderCampaigns();
    });

    campaignList.appendChild(root);
  });
}

function getReminderMessage(createdDate, reminderDays) {
  const created = new Date(createdDate);
  const reminderDate = new Date(created);
  reminderDate.setDate(reminderDate.getDate() + Number(reminderDays || 0));
  const now = new Date();

  const daysLeft = Math.ceil((reminderDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    return `⚠️ Optimization overdue by ${Math.abs(daysLeft)} day(s). Target was ${reminderDate.toLocaleDateString()}.`;
  }
  if (daysLeft === 0) {
    return `🔔 Optimize today (${reminderDate.toLocaleDateString()}).`;
  }
  return `⏳ Next optimization reminder in ${daysLeft} day(s), on ${reminderDate.toLocaleDateString()}.`;
}

function openKeywordSheet(campaignId) {
  activeKeywordCampaignId = campaignId;
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;
  keywordText.value = (campaign.keywordList || []).join('\n');
  keywordDialog.showModal();
}

function startEdit(campaign) {
  form.dataset.editId = campaign.id;
  document.getElementById('campaignName').value = campaign.campaignName;
  document.getElementById('createdDate').value = campaign.createdDate;
  document.getElementById('adType').value = campaign.adType;
  document.getElementById('matchType').value = campaign.matchType;
  document.getElementById('category').value = campaign.category;
  document.getElementById('asinList').value = campaign.asinList;
  document.getElementById('budget').value = campaign.budget;
  document.getElementById('placements').value = campaign.placements;
  document.getElementById('reminderDays').value = campaign.reminderDays;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadCampaigns() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCampaigns() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
}

renderCampaigns();

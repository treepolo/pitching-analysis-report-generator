'use strict';

const state = {
  projects: [],
  activeProject: null,
  selectedSectionId: null,
  saveTimer: null,
  saveInFlight: null,
  saveQueued: false,
  dirty: false,
  revision: 0,
  pendingTextImport: null,
};

const elements = {
  projectList: document.querySelector('#project-list'),
  projectEmpty: document.querySelector('#project-empty'),
  editorEmpty: document.querySelector('#editor-empty'),
  editor: document.querySelector('#editor'),
  projectTitle: document.querySelector('#project-title'),
  projectMeta: document.querySelector('#project-meta'),
  sectionList: document.querySelector('#section-list'),
  sectionTitle: document.querySelector('#section-title'),
  sectionContent: document.querySelector('#section-content'),
  preview: document.querySelector('#preview'),
  mediaLibrary: document.querySelector('#media-library'),
  mediaList: document.querySelector('#media-list'),
  mediaStatus: document.querySelector('#media-status'),
  importMedia: document.querySelector('#import-media'),
  importText: document.querySelector('#import-text'),
  importTextDialog: document.querySelector('#import-text-dialog'),
  importTextName: document.querySelector('#import-text-name'),
  importTextPreview: document.querySelector('#import-text-preview'),
  importTextError: document.querySelector('#import-text-error'),
  cancelImportText: document.querySelector('#cancel-import-text'),
  confirmImportText: document.querySelector('#confirm-import-text'),
  newProjectForm: document.querySelector('#new-project-form'),
  newProjectName: document.querySelector('#new-project-name'),
  newProjectDialog: document.querySelector('#new-project-dialog'),
  saveProject: document.querySelector('#save-project'),
  saveState: document.querySelector('#save-state'),
  rootPath: document.querySelector('#root-path'),
  appError: document.querySelector('#app-error'),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '時間未知' : date.toLocaleString();
}

function activeSection() {
  return state.activeProject?.sections.find((section) => section.id === state.selectedSectionId);
}

function textBlockFor(section) {
  return section?.blocks.find((block) => block.type === 'rich-text' || block.type === 'text');
}

function editableTextBlockFor(section) {
  const existing = textBlockFor(section);
  if (existing) return existing;
  const block = { id: `${section.id}-text`, type: 'rich-text', content: '' };
  section.blocks.push(block);
  return block;
}

function referenceId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  if (value && typeof value === 'object' && typeof value.mediaAssetId === 'string') return value.mediaAssetId;
  return null;
}

function mediaAssetFor(assetId) {
  return state.activeProject?.media?.find((asset) => asset?.id === assetId) || null;
}

function mediaStatusLabel(asset) {
  if (!asset) return '找不到此專案媒體';
  const lifecycle = asset.lifecycleStatus || asset.status || 'unknown';
  const compatibility = asset.compatibility || 'unknown';
  return `狀態：${lifecycle} · 相容性：${compatibility}`;
}

function renderMediaLibrary() {
  const project = state.activeProject;
  elements.mediaLibrary.hidden = !project;
  elements.importMedia.disabled = !project;
  elements.importText.disabled = !project;
  if (!project) {
    elements.mediaList.innerHTML = '';
    elements.mediaStatus.textContent = '尚未載入媒體。';
    return;
  }

  const media = Array.isArray(project.media) ? project.media : [];
  elements.mediaStatus.textContent = media.length === 0
    ? '目前沒有專案媒體；匯入後會先以 discovered/unknown 狀態保存，等待後續 inspect pipeline。'
    : `${media.length} 個媒體 asset；目前只顯示 domain status，不宣稱可播放或 metadata 已完成。`;
  elements.mediaList.innerHTML = media.length === 0
    ? '<p class="empty-state">尚未匯入圖片或影片。</p>'
    : media.map((asset) => `
      <article class="media-card">
        <div>
          <div class="media-card-title">${escapeHtml(asset.displayName || asset.id || '未命名媒體')}</div>
          <p class="media-card-meta">${escapeHtml(mediaStatusLabel(asset))} · ${escapeHtml(asset.mediaKind || 'unknown')}</p>
        </div>
        <div class="media-card-actions"><button class="button button-secondary" data-remove-media="${escapeHtml(asset.id)}" type="button">移除</button></div>
      </article>
    `).join('');
  elements.mediaList.querySelectorAll('[data-remove-media]').forEach((button) => {
    button.addEventListener('click', () => { void removeMedia(button.dataset.removeMedia); });
  });
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function setError(message) {
  elements.appError.textContent = message ? String(message) : '';
  elements.appError.hidden = !message;
}

function setSaveState(value, stateName = '') {
  elements.saveState.textContent = value;
  elements.saveState.dataset.state = stateName;
}

function renderProjects() {
  elements.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-card ${project.id === state.activeProject?.id ? 'is-active' : ''}" data-project-id="${escapeHtml(project.id)}" type="button">
      <span class="project-card-title">${escapeHtml(project.displayName)}</span>
      <span class="project-card-meta">${project.sectionCount} 個 section · ${escapeHtml(formatDate(project.updatedAt))}</span>
    </button>
  `).join('');
  elements.projectEmpty.hidden = state.projects.length !== 0;
  elements.projectList.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => { void openProject(button.dataset.projectId); });
  });
}

function renderSectionList() {
  const project = state.activeProject;
  elements.sectionList.innerHTML = project.sections.map((section) => `
    <button class="section-item ${section.id === state.selectedSectionId ? 'is-active' : ''}" data-section-id="${escapeHtml(section.id)}" type="button">
      <span>${escapeHtml(section.title || '未命名 section')}</span><small>${section.blocks.length} blocks</small>
    </button>
  `).join('');
  elements.sectionList.querySelectorAll('[data-section-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSectionId = button.dataset.sectionId;
      renderEditor();
      renderPreview();
    });
  });
}

function renderEditor({ preserveForm = false } = {}) {
  const project = state.activeProject;
  elements.editorEmpty.hidden = Boolean(project);
  elements.editor.hidden = !project;
  elements.saveProject.disabled = !project;
  renderMediaLibrary();
  if (!project) return;

  elements.projectTitle.textContent = project.displayName;
  elements.projectMeta.textContent = `已儲存於專案資料夾 · ${formatDate(project.updatedAt)}`;
  renderSectionList();

  const section = activeSection();
  if (!section) {
    elements.sectionTitle.value = '';
    elements.sectionContent.value = '';
    elements.sectionTitle.disabled = true;
    elements.sectionContent.disabled = true;
    return;
  }

  elements.sectionTitle.disabled = false;
  elements.sectionContent.disabled = false;
  if (!preserveForm) {
    elements.sectionTitle.value = section.title;
    elements.sectionContent.value = textBlockFor(section)?.content || '';
  }
}

function previewMediaReference(value, role = '媒體') {
  const assetId = referenceId(value);
  const asset = assetId ? mediaAssetFor(assetId) : null;
  const title = asset?.displayName || assetId || `${role} reference missing`;
  return `<div class="preview-media-placeholder" data-asset-id="${escapeHtml(assetId || '')}">`
    + `<strong>${escapeHtml(title)}</strong>`
    + `<span>${escapeHtml(mediaStatusLabel(asset))}</span>`
    + '<small>Renderer-only media seam；實際播放與 metadata inspect 留待後續 slice。</small>'
    + '</div>';
}

function renderPreviewBlock(block) {
  const type = typeof block?.type === 'string' ? block.type.toLowerCase() : 'unknown';
  if (type === 'rich-text' || type === 'text') {
    return `<p>${escapeHtml(block.content || '') || '<span class="muted">尚未填寫</span>'}</p>`;
  }
  if (type === 'heading' || type === 'subheading') {
    return `<h4>${escapeHtml(block.label || block.title || block.content || '')}</h4>`;
  }
  if (type === 'image' || type === 'imageblock' || type === 'photo') {
    return `<div class="preview-block"><strong>${escapeHtml(block.caption || block.alt || '圖片')}</strong>${previewMediaReference(block.mediaAssetId || block.imageAssetId || block.assetRef, '圖片')}</div>`;
  }
  if (type === 'singlevideo' || type === 'video' || type === 'video-block') {
    return `<div class="preview-block"><strong>${escapeHtml(block.label || '單影片')}</strong>${previewMediaReference(block.mediaAssetId || block.videoAssetId || block.assetRef, '影片')}</div>`;
  }
  if (type === 'comparisonvideo' || type === 'comparison-video' || type === 'comparison') {
    const left = block.left || block.sides?.left || block.leftAssetId;
    const right = block.right || block.sides?.right || block.rightAssetId;
    return `<div class="preview-block"><strong>${escapeHtml(block.label || '兩影片比較')}</strong><div class="preview-comparison">${previewMediaReference(left, '左側媒體')}${previewMediaReference(right, '右側媒體')}</div></div>`;
  }
  return block.content ? `<p>${escapeHtml(block.content)}</p>` : '';
}

function renderPreview() {
  const project = state.activeProject;
  if (!project) {
    elements.preview.innerHTML = '<p class="muted">建立或開啟專案後，這裡會顯示報告預覽。</p>';
    return;
  }

  const reportDocument = window.pitchingReportContract.toReportDocument(project);
  elements.preview.innerHTML = `
    <article class="report-preview">
      <p class="eyebrow">投球動作分析</p>
      <h2>${escapeHtml(reportDocument.title || '投球動作分析報告')}</h2>
      ${reportDocument.sections.map((section) => {
        const heading = section.title ? `<h3>${escapeHtml(section.title)}</h3>` : '';
        const blocks = section.blocks.map(renderPreviewBlock).join('');
        return `<section>${heading}${blocks || '<p><span class="muted">尚未填寫</span></p>'}</section>`;
      }).join('')}
    </article>
  `;
}

async function refreshProjects() {
  state.projects = await window.pitchingApp.listProjects();
  renderProjects();
}

async function persistActiveProject() {
  if (!state.activeProject) return null;
  if (state.saveInFlight) {
    state.saveQueued = true;
    return state.saveInFlight;
  }

  const projectId = state.activeProject.id;
  const revision = state.revision;
  const snapshot = cloneProject(state.activeProject);
  setSaveState('儲存中…', 'saving');

  state.saveInFlight = (async () => {
    try {
      const saved = await window.pitchingApp.saveProject(snapshot);
      if (state.activeProject?.id === projectId && state.revision === revision) {
        state.activeProject = saved;
        state.dirty = false;
        renderProjects();
        renderEditor({ preserveForm: true });
        renderPreview();
        setSaveState('已儲存', 'saved');
      } else {
        state.dirty = true;
        setSaveState('尚有未儲存變更', 'dirty');
      }
      return saved;
    } catch (error) {
      setSaveState('儲存失敗', 'error');
      setError(`儲存失敗：${error.message}`);
      throw error;
    } finally {
      state.saveInFlight = null;
      const needsFollowUp = state.saveQueued
        || (state.activeProject?.id === projectId && state.dirty && state.revision !== revision);
      state.saveQueued = false;
      if (needsFollowUp) void persistActiveProject().catch(() => {});
    }
  })();

  return state.saveInFlight;
}

async function requestSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.activeProject || !state.dirty) return state.saveInFlight;
  return persistActiveProject();
}

async function flushPendingChanges() {
  while (state.activeProject && (state.dirty || state.saveInFlight)) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (state.dirty) {
      await requestSave();
    } else if (state.saveInFlight) {
      await state.saveInFlight;
    }
  }
}

function scheduleSave() {
  state.dirty = true;
  state.revision += 1;
  setSaveState('未儲存變更', 'dirty');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    void requestSave().catch(() => {});
  }, 500);
}

async function openProject(projectId) {
  setError('');
  try {
    if (state.activeProject && state.dirty) await requestSave();
    const project = await window.pitchingApp.openProject(projectId);
    state.activeProject = project;
    state.selectedSectionId = project.sections[0]?.id || null;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('已載入', 'saved');
  } catch (error) {
    setSaveState('開啟失敗', 'error');
    setError(`開啟專案失敗：${error.message}`);
  }
}

function resetTextImportDialog() {
  state.pendingTextImport = null;
  elements.importTextName.textContent = '—';
  elements.importTextPreview.textContent = '';
  elements.importTextError.textContent = '';
  elements.importTextError.hidden = true;
}

async function requestTextImport() {
  if (!state.activeProject) return;
  setError('');
  try {
    const imported = await window.pitchingApp.pickTextFile();
    if (!imported) return;
    state.pendingTextImport = imported;
    elements.importTextName.textContent = imported.fileName;
    elements.importTextPreview.textContent = imported.content;
    elements.importTextError.textContent = '';
    elements.importTextError.hidden = true;
    elements.importTextDialog.showModal();
  } catch (error) {
    setSaveState('匯入失敗', 'error');
    setError(`讀取文字檔失敗：${error.message}`);
  }
}

async function confirmTextImport() {
  const imported = state.pendingTextImport;
  const project = state.activeProject;
  if (!imported || !project || !state.selectedSectionId) return;
  elements.confirmImportText.disabled = true;
  try {
    const saved = await window.pitchingApp.insertTextBlock({
      projectId: project.id,
      sectionId: state.selectedSectionId,
      fileName: imported.fileName,
      content: imported.content,
    });
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    elements.importTextDialog.close();
    resetTextImportDialog();
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('文字已匯入並儲存', 'saved');
  } catch (error) {
    elements.importTextError.textContent = `匯入失敗：${error.message}`;
    elements.importTextError.hidden = false;
    setError(`匯入文字失敗：${error.message}`);
  } finally {
    elements.confirmImportText.disabled = false;
  }
}

async function importMedia() {
  if (!state.activeProject) return;
  setError('');
  try {
    const saved = await window.pitchingApp.pickMediaFiles(state.activeProject.id);
    if (!saved) return;
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('媒體已登錄；等待 inspect', 'saved');
  } catch (error) {
    setSaveState('媒體匯入失敗', 'error');
    setError(`媒體匯入失敗：${error.message}`);
  }
}

async function removeMedia(assetId) {
  if (!state.activeProject || !assetId) return;
  if (!window.confirm('確定從此專案移除這個媒體 asset？')) return;
  setError('');
  try {
    const saved = await window.pitchingApp.removeMedia(state.activeProject.id, assetId);
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('媒體已移除並儲存', 'saved');
  } catch (error) {
    setSaveState('媒體移除失敗', 'error');
    setError(`媒體移除失敗：${error.message}`);
  }
}

elements.newProjectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  try {
    if (state.activeProject && state.dirty) await requestSave();
    const project = await window.pitchingApp.createProject(elements.newProjectName.value);
    elements.newProjectDialog.close();
    elements.newProjectForm.reset();
    await refreshProjects();
    await openProject(project.id);
  } catch (error) {
    setSaveState('建立失敗', 'error');
    setError(`建立專案失敗：${error.message}`);
  }
});

document.querySelector('#new-project').addEventListener('click', () => {
  setError('');
  if (!elements.newProjectDialog.open) elements.newProjectDialog.showModal();
  elements.newProjectName.focus();
});

document.querySelector('#empty-new-project').addEventListener('click', () => {
  document.querySelector('#new-project').click();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => elements.newProjectDialog.close());
});

elements.saveProject.addEventListener('click', () => {
  void requestSave().catch(() => {});
});

elements.importText.addEventListener('click', () => { void requestTextImport(); });
elements.importMedia.addEventListener('click', () => { void importMedia(); });
elements.cancelImportText.addEventListener('click', () => {
  elements.importTextDialog.close();
  resetTextImportDialog();
});
elements.confirmImportText.addEventListener('click', () => { void confirmTextImport(); });

elements.sectionTitle.addEventListener('input', () => {
  const section = activeSection();
  if (!section) return;
  section.title = elements.sectionTitle.value;
  renderSectionList();
  renderPreview();
  scheduleSave();
});

elements.sectionContent.addEventListener('input', () => {
  const section = activeSection();
  if (!section) return;
  editableTextBlockFor(section).content = elements.sectionContent.value;
  renderPreview();
  scheduleSave();
});

window.pitchingApp.onBeforeClose(() => flushPendingChanges());

(async function bootstrap() {
  try {
    const info = await window.pitchingApp.getAppInfo();
    elements.rootPath.textContent = info.projectRoot;
    await refreshProjects();
    renderEditor();
    renderPreview();
  } catch (error) {
    elements.rootPath.textContent = '無法讀取';
    setSaveState('啟動失敗', 'error');
    setError(`應用程式啟動失敗：${error.message}`);
  }
})();

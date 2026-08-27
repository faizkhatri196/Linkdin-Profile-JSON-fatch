document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('extract-form');
  const urlInput = document.getElementById('profile-url');
  const btnSubmit = document.getElementById('btn-submit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const spinner = document.getElementById('spinner');
  const btnPaste = document.getElementById('btn-paste');
  const chips = document.querySelectorAll('.chip');
  const errorBanner = document.getElementById('error-banner');
  const errorCode = document.getElementById('error-code');
  const errorMessage = document.getElementById('error-message');
  const btnCloseError = document.getElementById('btn-close-error');
  const resultsSection = document.getElementById('results-section');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const btnCopyJson = document.getElementById('btn-copy-json');
  const btnDownloadJson = document.getElementById('btn-download-json');
  const jsonCode = document.getElementById('json-code');
  const curlCode = document.getElementById('curl-code');

  let currentResponseJson = null;

  // Paste button
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) urlInput.value = text.trim();
    } catch (e) {
      urlInput.focus();
    }
  });

  // Quick Chips
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      urlInput.value = chip.dataset.url;
      form.dispatchEvent(new Event('submit'));
    });
  });

  // Close Error
  btnCloseError.addEventListener('click', () => {
    errorBanner.style.display = 'none';
  });

  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = 'tab-' + tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    hideError();
    setLoading(true);

    try {
      const res = await fetch('/api/linkedin/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      currentResponseJson = data;

      if (!res.ok || !data.success) {
        showError(data.error?.code || ('HTTP_' + res.status), data.error?.message || 'Failed to extract profile.');
      } else {
        renderProfile(data);
      }
    } catch (err) {
      showError('NETWORK_ERROR', 'Could not connect to the API server: ' + err.message);
    } finally {
      setLoading(false);
    }
  });

  function renderProfile(data) {
    const p = data.profile;
    const meta = data.metadata;

    // Avatar
    const imgEl = document.getElementById('profile-img');
    const fallbackEl = document.getElementById('avatar-fallback');
    if (p.profileImage) {
      imgEl.src = p.profileImage;
      imgEl.style.display = 'block';
      fallbackEl.style.display = 'none';
    } else {
      imgEl.style.display = 'none';
      fallbackEl.style.display = 'flex';
    }

    // Main Info
    document.getElementById('profile-name').textContent = p.name || 'Anonymous User';
    document.getElementById('profile-headline').textContent = p.headline || 'No headline available';
    document.getElementById('profile-location').textContent = p.location ? ('📍 ' + p.location) : '📍 Location not specified';
    
    const linkEl = document.getElementById('profile-link');
    linkEl.href = p.url || '#';

    // About
    const aboutSection = document.getElementById('section-about');
    if (p.about) {
      document.getElementById('profile-about').textContent = p.about;
      aboutSection.style.display = 'block';
    } else {
      aboutSection.style.display = 'none';
    }

    // Experience
    const expSection = document.getElementById('section-experience');
    const expList = document.getElementById('experience-list');
    expList.innerHTML = '';
    if (p.experience && p.experience.length > 0) {
      p.experience.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
          <div class="timeline-title">${escapeHtml(exp.title || 'Position')}</div>
          <div class="timeline-subtitle">${escapeHtml(exp.company || '')}</div>
          <div class="timeline-dates">${escapeHtml(exp.startDate || '')} ${exp.endDate ? '– ' + escapeHtml(exp.endDate) : ''} ${exp.location ? '· ' + escapeHtml(exp.location) : ''}</div>
          ${exp.description ? `<div class="timeline-desc">${escapeHtml(exp.description)}</div>` : ''}
        `;
        expList.appendChild(item);
      });
      expSection.style.display = 'block';
    } else {
      expSection.style.display = 'none';
    }

    // Education
    const eduSection = document.getElementById('section-education');
    const eduList = document.getElementById('education-list');
    eduList.innerHTML = '';
    if (p.education && p.education.length > 0) {
      p.education.forEach(edu => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
          <div class="timeline-title">${escapeHtml(edu.institution || 'School')}</div>
          <div class="timeline-subtitle">${escapeHtml(edu.degree || '')} ${edu.fieldOfStudy ? '· ' + escapeHtml(edu.fieldOfStudy) : ''}</div>
          <div class="timeline-dates">${escapeHtml(edu.startDate || '')} ${edu.endDate ? '– ' + escapeHtml(edu.endDate) : ''}</div>
        `;
        eduList.appendChild(item);
      });
      eduSection.style.display = 'block';
    } else {
      eduSection.style.display = 'none';
    }

    // Skills
    const skillsSection = document.getElementById('section-skills');
    const skillsList = document.getElementById('skills-list');
    skillsList.innerHTML = '';
    if (p.skills && p.skills.length > 0) {
      p.skills.forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'skill-tag';
        tag.textContent = skill;
        skillsList.appendChild(tag);
      });
      skillsSection.style.display = 'block';
    } else {
      skillsSection.style.display = 'none';
    }

    // Metadata
    document.getElementById('meta-time').textContent = new Date(meta.retrievedAt).toLocaleString();
    const cachedBadge = document.getElementById('meta-cached');
    cachedBadge.textContent = meta.cached ? 'Cached (TTL)' : 'Live Scraped';

    // JSON Tab
    jsonCode.textContent = JSON.stringify(data, null, 2);

    // cURL Tab
    curlCode.textContent = `curl -X POST ${window.location.origin}/api/linkedin/profile \\
  -H "Content-Type: application/json" \\
  -d '{"url": "${p.url}"}'`;

    resultsSection.style.display = 'block';
  }

  function setLoading(loading) {
    if (loading) {
      btnText.style.display = 'none';
      spinner.style.display = 'block';
      btnSubmit.disabled = true;
    } else {
      btnText.style.display = 'inline';
      spinner.style.display = 'none';
      btnSubmit.disabled = false;
    }
  }

  function showError(code, msg) {
    errorCode.textContent = code;
    errorMessage.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError() {
    errorBanner.style.display = 'none';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Copy JSON
  btnCopyJson.addEventListener('click', () => {
    if (!currentResponseJson) return;
    navigator.clipboard.writeText(JSON.stringify(currentResponseJson, null, 2));
    const originalText = btnCopyJson.querySelector('span').textContent;
    btnCopyJson.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      btnCopyJson.querySelector('span').textContent = originalText;
    }, 2000);
  });

  // Download JSON
  btnDownloadJson.addEventListener('click', () => {
    if (!currentResponseJson) return;
    const blob = new Blob([JSON.stringify(currentResponseJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkedin-profile-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

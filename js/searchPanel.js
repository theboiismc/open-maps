// searchPanel.js
export function initSearchPanel({ map, isMobile }) {
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const closeInfoBtn = document.getElementById('close-info-btn');

    function moveSearchBarToPanel() {
        if (!isMobile) {
            mainSearchContainer.style.boxShadow = 'none';
            mainSearchContainer.style.borderRadius = '8px';
            panelSearchPlaceholder.hidden = false;
            panelSearchPlaceholder.appendChild(mainSearchContainer);
            topSearchWrapper.style.opacity = '0';
        }
    }

    function moveSearchBarToTop() {
        if (!isMobile) {
            mainSearchContainer.style.boxShadow = '';
            mainSearchContainer.style.borderRadius = '';
            topSearchWrapper.appendChild(mainSearchContainer);
            panelSearchPlaceholder.hidden = true;
            topSearchWrapper.style.opacity = '1';
        }
    }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => {
            document.getElementById(id).hidden = id !== viewId;
        });
        if (!sidePanel.classList.contains('open')) {
            if (isMobile) {
                if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek');
            } else {
                sidePanel.classList.add('open');
                moveSearchBarToPanel();
            }
        }
    }

    function closePanel() {
        if (isMobile) sidePanel.classList.remove('open', 'peek');
        else { sidePanel.classList.remove('open'); moveSearchBarToTop(); }
    }

    if (closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
    closeInfoBtn.addEventListener('click', closePanel);

    return { showPanel, closePanel, mainSearchInput };
}

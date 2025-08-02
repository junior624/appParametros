// --- Imports do Firebase SDK ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuração do Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyBriXRfGzGKwsgtR6BXABd4sV6d8RNxYTo",
    authDomain: "parametrosap.firebaseapp.com",
    projectId: "parametrosap",
    storageBucket: "parametrosap.firebasestorage.app",
    messagingSenderId: "1033564215134",
    appId: "1:1033564215134:web:f54b868344f21d4f90e1cf",
    measurementId: "G-90X7QGZ1SP"
};

// --- Variáveis Globais ---
let db, auth;
let allParams = [];
let filteredParams = [];
let selectedParams = new Set();
let currentPage = 1;
let pageSize = 25;
let sortField = 'createdAt';
let sortDirection = 'desc';
let history = [];
let currentTheme = localStorage.getItem('theme') || 'light';

// --- Elementos DOM ---
const elements = {
    // Controles
    searchBox: document.getElementById('search-box'),
    addParamBtn: document.getElementById('add-param-btn'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    historyBtn: document.getElementById('history-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    fieldFilter: document.getElementById('field-filter'),
    clearFilters: document.getElementById('clear-filters'),
    refreshBtn: document.getElementById('refresh-btn'),
    
    // Tabela
    tableBody: document.getElementById('table-body'),
    selectAll: document.getElementById('select-all'),
    
    // Paginação
    pageSize: document.getElementById('page-size'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info'),
    showingStart: document.getElementById('showing-start'),
    showingEnd: document.getElementById('showing-end'),
    totalItems: document.getElementById('total-items'),
    
    // Ações em lote
    bulkActions: document.getElementById('bulk-actions'),
    selectedCount: document.getElementById('selected-count'),
    bulkDelete: document.getElementById('bulk-delete'),
    bulkExport: document.getElementById('bulk-export'),
    deselectAll: document.getElementById('deselect-all'),
    
    // Modais
    paramModal: document.getElementById('param-modal'),
    confirmModal: document.getElementById('confirm-modal'),
    exportModal: document.getElementById('export-modal'),
    closeModal: document.getElementById('close-modal'),
    cancelBtn: document.getElementById('cancel-btn'),
    
    // Formulário
    paramForm: document.getElementById('param-form'),
    docId: document.getElementById('doc-id'),
    campo: document.getElementById('campo'),
    valor: document.getElementById('valor'),
    descricao: document.getElementById('descricao'),
    modalTitle: document.getElementById('modal-title'),
    submitBtn: document.getElementById('submit-btn'),
    
    // Estatísticas
    totalParams: document.getElementById('total-params'),
    todayParams: document.getElementById('today-params'),
    weekParams: document.getElementById('week-params'),
    monthParams: document.getElementById('month-params'),
    
    // Histórico
    historyPanel: document.getElementById('history-panel'),
    historyList: document.getElementById('history-list'),
    closeHistory: document.getElementById('close-history'),
    
    // Import/Export
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    exportFormat: document.getElementById('export-format'),
    exportHeaders: document.getElementById('export-headers'),
    doExport: document.getElementById('do-export'),
    
    // Notificações
    notification: document.getElementById('notification'),
    notificationText: document.getElementById('notification-text')
};

// --- Inicialização ---
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Aplicar tema inicial
        document.body.setAttribute('data-theme', currentTheme);
        
        // Inicializar Firebase
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Autenticação
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('Autenticação bem-sucedida.');
                setupFirestoreListener();
            } else {
                console.error('Nenhum usuário logado.');
                showNotification('Erro na autenticação', 'error');
            }
        });

        // Configurar event listeners
        setupEventListeners();
        
    } catch (e) {
        console.error('Erro ao inicializar:', e);
        showNotification('Erro ao inicializar a aplicação', 'error');
    }
});

// --- Configuração do Firestore ---
function setupFirestoreListener() {
    const q = query(collection(db, 'parametros'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (querySnapshot) => {
        allParams = [];
        querySnapshot.forEach((doc) => {
            allParams.push({ id: doc.id, ...doc.data() });
        });
        
        updateStatistics();
        applyFiltersAndSort();
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    // Controles principais
    elements.addParamBtn.addEventListener('click', () => openParamModal());
    elements.exportBtn.addEventListener('click', () => openExportModal());
    elements.importBtn.addEventListener('click', () => toggleImportZone());
    elements.historyBtn.addEventListener('click', () => toggleHistoryPanel());
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.refreshBtn.addEventListener('click', () => {
        showNotification('Dados atualizados', 'success');
        updateStatistics();
    });
    
    // Busca e filtros
    elements.searchBox.addEventListener('input', debounce(applyFiltersAndSort, 300));
    elements.fieldFilter.addEventListener('change', applyFiltersAndSort);
    elements.clearFilters.addEventListener('click', clearFilters);
    
    // Paginação
    elements.pageSize.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    });
    elements.prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    elements.nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredParams.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    
    // Seleção
    elements.selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.row-checkbox:not(#select-all)');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            if (e.target.checked) {
                selectedParams.add(cb.dataset.id);
            } else {
                selectedParams.delete(cb.dataset.id);
            }
        });
        updateBulkActions();
    });
    
    // Ações em lote
    elements.bulkDelete.addEventListener('click', () => confirmBulkDelete());
    elements.bulkExport.addEventListener('click', () => exportSelected());
    elements.deselectAll.addEventListener('click', clearSelection);
    
    // Modais
    elements.closeModal.addEventListener('click', closeParamModal);
    elements.cancelBtn.addEventListener('click', closeParamModal);
    elements.closeHistory.addEventListener('click', () => toggleHistoryPanel());
    
    // Formulário
    elements.paramForm.addEventListener('submit', handleFormSubmit);
    
    // Ordenação da tabela
    document.addEventListener('click', (e) => {
        if (e.target.closest('th.sortable')) {
            const field = e.target.closest('th').dataset.field;
            handleSort(field);
        }
    });
    
    // Cliques na tabela
    elements.tableBody.addEventListener('click', handleTableClick);
    
    // Import/Export
    elements.fileInput.addEventListener('change', handleFileImport);
    elements.doExport.addEventListener('click', performExport);
    
    // Drag and Drop
    setupDragAndDrop();
    
    // Fechar modais clicando fora
    window.addEventListener('click', (e) => {
        if (e.target === elements.paramModal) closeParamModal();
        if (e.target === elements.confirmModal) closeConfirmModal();
        if (e.target === elements.exportModal) closeExportModal();
    });
}

// --- Funções de Utilidade ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatDate(date) {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(d);
}

function addToHistory(action, details) {
    const historyItem = {
        id: Date.now(),
        action,
        details,
        timestamp: new Date()
    };
    history.unshift(historyItem);
    if (history.length > 50) {
        history = history.slice(0, 50);
    }
    updateHistoryPanel();
}

// --- Tema ---
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    showNotification(`Tema ${currentTheme === 'light' ? 'claro' : 'escuro'} ativado`, 'info');
}

// --- Notificações ---
function showNotification(message, type = 'success') {
    elements.notification.className = `notification ${type}`;
    elements.notificationText.textContent = message;
    elements.notification.classList.add('show');
    
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

// --- Estatísticas ---
function updateStatistics() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayCount = allParams.filter(p => {
        const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
        return createdAt >= today;
    }).length;

    const weekCount = allParams.filter(p => {
        const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
        return createdAt >= weekAgo;
    }).length;

    const monthCount = allParams.filter(p => {
        const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
        return createdAt >= monthAgo;
    }).length;

    elements.totalParams.textContent = allParams.length.toLocaleString();
    elements.todayParams.textContent = todayCount.toLocaleString();
    elements.weekParams.textContent = weekCount.toLocaleString();
    elements.monthParams.textContent = monthCount.toLocaleString();
}

// --- Filtros e Ordenação ---
function applyFiltersAndSort() {
    let filtered = [...allParams];
    
    // Aplicar busca
    const searchTerm = elements.searchBox.value.toLowerCase();
    if (searchTerm) {
        const fieldFilter = elements.fieldFilter.value;
        filtered = filtered.filter(param => {
            if (fieldFilter) {
                return param[fieldFilter]?.toString().toLowerCase().includes(searchTerm);
            } else {
                const searchString = `${param.campo || ''} ${param.valor || ''} ${param.descricao || ''}`.toLowerCase();
                return searchString.includes(searchTerm);
            }
        });
    }
    
    // Aplicar ordenação
    filtered.sort((a, b) => {
        let aVal = a[sortField] || '';
        let bVal = b[sortField] || '';
        
        if (sortField === 'createdAt') {
            aVal = aVal?.toDate ? aVal.toDate() : new Date(aVal || 0);
            bVal = bVal?.toDate ? bVal.toDate() : new Date(bVal || 0);
        } else {
            aVal = aVal.toString().toLowerCase();
            bVal = bVal.toString().toLowerCase();
        }
        
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    filteredParams = filtered;
    currentPage = 1;
    renderTable();
}

function handleSort(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }
    
    // Atualizar indicadores visuais
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    const th = document.querySelector(`th[data-field="${field}"]`);
    th.classList.add(`sort-${sortDirection}`);
    
    applyFiltersAndSort();
}

function clearFilters() {
    elements.searchBox.value = '';
    elements.fieldFilter.value = '';
    applyFiltersAndSort();
    showNotification('Filtros limpos', 'info');
}

// --- Renderização da Tabela ---
function renderTable() {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = filteredParams.slice(start, end);
    
    elements.tableBody.innerHTML = '';
    
    if (pageItems.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <div>Nenhum parâmetro encontrado</div>
            </td>
        `;
        elements.tableBody.appendChild(row);
    } else {
        pageItems.forEach(param => {
            const row = document.createElement('tr');
            row.dataset.id = param.id;
            
            if (selectedParams.has(param.id)) {
                row.classList.add('selected');
            }
            
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="row-checkbox" data-id="${param.id}" ${selectedParams.has(param.id) ? 'checked' : ''}>
                </td>
                <td class="copy-cell" title="Clique para copiar">${param.campo || ''}</td>
                <td class="copy-cell" title="Clique para copiar">${param.valor || ''}</td>
                <td class="copy-cell" title="Clique para copiar">${param.descricao || ''}</td>
                <td>${formatDate(param.createdAt)}</td>
                <td>
                    <button class="action-btn edit-btn" data-id="${param.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn copy-btn" data-id="${param.id}" title="Copiar">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${param.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            elements.tableBody.appendChild(row);
        });
    }
    
    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredParams.length / pageSize);
    const start = Math.min((currentPage - 1) * pageSize + 1, filteredParams.length);
    const end = Math.min(currentPage * pageSize, filteredParams.length);
    
    elements.showingStart.textContent = filteredParams.length === 0 ? 0 : start;
    elements.showingEnd.textContent = end;
    elements.totalItems.textContent = filteredParams.length;
    elements.pageInfo.textContent = `Página ${currentPage} de ${Math.max(totalPages, 1)}`;
    
    elements.prevPage.disabled = currentPage === 1;
    elements.nextPage.disabled = currentPage === totalPages || totalPages === 0;
}

// --- Manipulação da Tabela ---
function handleTableClick(e) {
    const row = e.target.closest('tr');
    if (!row || !row.dataset.id) return;
    
    const paramId = row.dataset.id;
    const param = allParams.find(p => p.id === paramId);
    
    if (e.target.classList.contains('row-checkbox')) {
        // Checkbox
        if (e.target.checked) {
            selectedParams.add(paramId);
            row.classList.add('selected');
        } else {
            selectedParams.delete(paramId);
            row.classList.remove('selected');
        }
        updateBulkActions();
        
    } else if (e.target.closest('.edit-btn')) {
        // Editar
        openParamModal(param);
        
    } else if (e.target.closest('.delete-btn')) {
        // Excluir
        confirmDelete(param);
        
    } else if (e.target.closest('.copy-btn') || e.target.classList.contains('copy-cell')) {
        // Copiar
        const textToCopy = e.target.classList.contains('copy-cell') 
            ? e.target.textContent 
            : `${param.campo}: ${param.valor}`;
        copyToClipboard(textToCopy);
    }
}

// --- Seleção e Ações em Lote ---
function updateBulkActions() {
    elements.selectedCount.textContent = selectedParams.size;
    
    if (selectedParams.size > 0) {
        elements.bulkActions.classList.add('show');
    } else {
        elements.bulkActions.classList.remove('show');
    }
    
    // Atualizar estado do checkbox "selecionar todos"
    const visibleCheckboxes = document.querySelectorAll('.row-checkbox:not(#select-all)');
    const checkedBoxes = document.querySelectorAll('.row-checkbox:not(#select-all):checked');
    
    elements.selectAll.checked = visibleCheckboxes.length > 0 && visibleCheckboxes.length === checkedBoxes.length;
    elements.selectAll.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < visibleCheckboxes.length;
}

function clearSelection() {
    selectedParams.clear();
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('selected'));
    updateBulkActions();
}

function confirmBulkDelete() {
    const count = selectedParams.size;
    showConfirmModal(
        `Tem certeza que deseja excluir ${count} parâmetro${count > 1 ? 's' : ''}?`,
        async () => {
            try {
                const promises = Array.from(selectedParams).map(id => 
                    deleteDoc(doc(db, 'parametros', id))
                );
                await Promise.all(promises);
                
                addToHistory('Exclusão em lote', `${count} parâmetros excluídos`);
                showNotification(`${count} parâmetros excluídos com sucesso`, 'success');
                clearSelection();
            } catch (error) {
                console.error('Erro ao excluir:', error);
                showNotification('Erro ao excluir parâmetros', 'error');
            }
        }
    );
}

function exportSelected() {
    const selectedData = allParams.filter(p => selectedParams.has(p.id));
    exportData(selectedData, `parametros_selecionados_${new Date().toISOString().split('T')[0]}`);
}

// --- Modais ---
function openParamModal(param = null) {
    if (param) {
        elements.modalTitle.textContent = 'Editar Parâmetro';
        elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Atualizar Parâmetro';
        elements.docId.value = param.id;
        elements.campo.value = param.campo || '';
        elements.valor.value = param.valor || '';
        elements.descricao.value = param.descricao || '';
    } else {
        elements.modalTitle.textContent = 'Adicionar Novo Parâmetro';
        elements.submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Parâmetro';
        elements.paramForm.reset();
        elements.docId.value = '';
    }
    
    elements.paramModal.style.display = 'block';
    setTimeout(() => elements.campo.focus(), 100);
}

function closeParamModal() {
    elements.paramModal.style.display = 'none';
    elements.paramForm.reset();
}

function showConfirmModal(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    elements.confirmModal.style.display = 'block';
    
    document.getElementById('confirm-action').onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
}

function closeConfirmModal() {
    elements.confirmModal.style.display = 'none';
}

function openExportModal() {
    elements.exportModal.style.display = 'block';
}

function closeExportModal() {
    elements.exportModal.style.display = 'none';
}

// --- Formulário ---
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const docId = elements.docId.value;
    const campo = elements.campo.value.trim();
    const valor = elements.valor.value.trim();
    const descricao = elements.descricao.value.trim();
    
    if (!campo || !valor) {
        showNotification('Chave e valor são obrigatórios', 'error');
        return;
    }
    
    // Desabilitar botão durante o salvamento
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<div class="loading"></div> Salvando...';
    
    try {
        if (docId) {
            // Atualizar documento existente
            const docRef = doc(db, 'parametros', docId);
            await updateDoc(docRef, { campo, valor, descricao });
            
            addToHistory('Parâmetro editado', `${campo}: ${valor}`);
            showNotification('Parâmetro atualizado com sucesso', 'success');
        } else {
            // Criar novo documento
            await addDoc(collection(db, 'parametros'), {
                campo,
                valor,
                descricao,
                createdAt: new Date()
            });
            
            addToHistory('Parâmetro criado', `${campo}: ${valor}`);
            showNotification('Parâmetro adicionado com sucesso', 'success');
        }
        
        closeParamModal();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showNotification('Erro ao salvar parâmetro', 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = docId 
            ? '<i class="fas fa-save"></i> Atualizar Parâmetro'
            : '<i class="fas fa-save"></i> Salvar Parâmetro';
    }
}

// --- Exclusão ---
function confirmDelete(param) {
    showConfirmModal(
        `Tem certeza que deseja excluir o parâmetro "${param.campo}"?`,
        async () => {
            try {
                await deleteDoc(doc(db, 'parametros', param.id));
                addToHistory('Parâmetro excluído', `${param.campo}: ${param.valor}`);
                showNotification('Parâmetro excluído com sucesso', 'success');
            } catch (error) {
                console.error('Erro ao excluir:', error);
                showNotification('Erro ao excluir parâmetro', 'error');
            }
        }
    );
}

// --- Copiar para Área de Transferência ---
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Copiado para a área de transferência', 'success');
        }).catch(() => {
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showNotification('Copiado para a área de transferência', 'success');
    } catch (err) {
        showNotification('Erro ao copiar texto', 'error');
    }
    
    document.body.removeChild(textArea);
}

// --- Exportação ---
function performExport() {
    const format = elements.exportFormat.value;
    const includeHeaders = elements.exportHeaders.checked;
    
    exportData(filteredParams, `parametros_${new Date().toISOString().split('T')[0]}`, format, includeHeaders);
    closeExportModal();
}

function exportData(data, filename, format = 'csv', includeHeaders = true) {
    if (data.length === 0) {
        showNotification('Nenhum dado para exportar', 'error');
        return;
    }

    let content, mimeType, extension;

    if (format === 'json') {
        const exportData = data.map(({ id, createdAt, ...rest }) => ({
            ...rest,
            createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt
        }));
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        extension = 'json';
    } else {
        // CSV
        const headers = ['Chave', 'Valor', 'Descrição', 'Data Criação'];
        const rows = data.map(param => [
            param.campo || '',
            param.valor || '',
            param.descricao || '',
            formatDate(param.createdAt)
        ]);

        const csvContent = [];
        if (includeHeaders) {
            csvContent.push(headers.join(','));
        }
        
        rows.forEach(row => {
            const escapedRow = row.map(cell => 
                `"${String(cell).replace(/"/g, '""')}"`
            );
            csvContent.push(escapedRow.join(','));
        });

        content = csvContent.join('\n');
        mimeType = 'text/csv';
        extension = 'csv';
    }

    // Download do arquivo
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    addToHistory('Dados exportados', `${data.length} registros em formato ${format.toUpperCase()}`);
    showNotification(`Dados exportados em ${format.toUpperCase()}`, 'success');
}

// --- Importação ---
function toggleImportZone() {
    const isVisible = elements.dropZone.style.display !== 'none';
    elements.dropZone.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        elements.dropZone.scrollIntoView({ behavior: 'smooth' });
    }
}

function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, unhighlight, false);
    });

    elements.dropZone.addEventListener('drop', handleDrop, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        elements.dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        elements.dropZone.classList.remove('dragover');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
}

function handleFiles(files) {
    ([...files]).forEach(handleFile);
}

function handleFile(file) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        showNotification('Apenas arquivos CSV são suportados', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            parseCSV(e.target.result);
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            showNotification('Erro ao processar arquivo CSV', 'error');
        }
    };
    reader.readAsText(file);
}

function handleFileImport(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        showNotification('Arquivo CSV deve ter pelo menos uma linha de dados', 'error');
        return;
    }

    // Assumir que a primeira linha são os cabeçalhos
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const dataLines = lines.slice(1);

    // Mapear colunas
    const campoIndex = headers.findIndex(h => h.toLowerCase().includes('chave') || h.toLowerCase().includes('campo'));
    const valorIndex = headers.findIndex(h => h.toLowerCase().includes('valor'));
    const descricaoIndex = headers.findIndex(h => h.toLowerCase().includes('descri'));

    if (campoIndex === -1 || valorIndex === -1) {
        showNotification('CSV deve conter colunas "chave/campo" e "valor"', 'error');
        return;
    }

    const importData = [];
    dataLines.forEach(line => {
        const cells = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cells[campoIndex] && cells[valorIndex]) {
            importData.push({
                campo: cells[campoIndex],
                valor: cells[valorIndex],
                descricao: descricaoIndex !== -1 ? cells[descricaoIndex] : '',
                createdAt: new Date()
            });
        }
    });

    if (importData.length === 0) {
        showNotification('Nenhum dado válido encontrado no CSV', 'error');
        return;
    }

    showConfirmModal(
        `Importar ${importData.length} parâmetros do arquivo CSV?`,
        () => performImport(importData)
    );
}

async function performImport(data) {
    let successCount = 0;
    let errorCount = 0;

    showNotification('Importando dados...', 'info');

    for (const item of data) {
        try {
            await addDoc(collection(db, 'parametros'), item);
            successCount++;
        } catch (error) {
            console.error('Erro ao importar item:', error);
            errorCount++;
        }
    }

    addToHistory('Dados importados', `${successCount} registros importados`);
    
    if (errorCount === 0) {
        showNotification(`${successCount} parâmetros importados com sucesso`, 'success');
    } else {
        showNotification(`${successCount} importados, ${errorCount} com erro`, 'error');
    }

    elements.dropZone.style.display = 'none';
    elements.fileInput.value = '';
}

// --- Histórico ---
function toggleHistoryPanel() {
    const isVisible = elements.historyPanel.classList.contains('show');
    if (isVisible) {
        elements.historyPanel.classList.remove('show');
    } else {
        elements.historyPanel.classList.add('show');
        updateHistoryPanel();
    }
}

function updateHistoryPanel() {
    if (history.length === 0) {
        elements.historyList.innerHTML = `
            <div class="history-item">
                <div class="history-action">Nenhuma ação registrada</div>
                <div class="history-time">Inicie usando o sistema para ver o histórico</div>
            </div>
        `;
        return;
    }

    elements.historyList.innerHTML = history.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-action">${item.action}</div>
            <div style="font-size: 14px; color: var(--text-secondary); margin: 0.5rem 0;">
                ${item.details}
            </div>
            <div class="history-time">
                ${new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(item.timestamp)}
            </div>
        </div>
    `).join('');
}

// --- Funções Globais ---
window.closeConfirmModal = closeConfirmModal;
window.closeExportModal = closeExportModal;
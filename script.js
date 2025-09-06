document.addEventListener('DOMContentLoaded', function () {
    // !!! IMPORTANT !!! PASTE YOUR DEPLOYED WEB APP URL HERE
    const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbz_ocr-_noHinCO3XL1V5fGhBR28PJKLWNjRfZb9RCcQrXNm86c0Fv90kTOcDz-hgMU/exec";
    // --- Global State Variables ---
    let allTasks = [];
    let allProjects = [];
    let allTeamMembers = [];

    // --- API Communication Layer ---
    async function fetchDataFromSheet(sheetName) {
        try {
            const response = await fetch(`${GOOGLE_SHEET_API_URL}?sheet=${sheetName}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Error fetching from ${sheetName}:`, error);
            showToast(`Failed to load ${sheetName.toLowerCase()}. Check API URL and permissions.`, 'error');
            return []; // Return empty array on failure
        }
    }

    async function updateSheetData(action, sheetName, data) {
    try {
        const response = await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, sheetName, data })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        if (result.error) throw new Error(result.error);

        return { success: true, result };
    } catch (error) {
        console.error(`Error performing ${action} on ${sheetName}:`, error);
        showToast(`Operation failed: ${action} on ${sheetName}.`, 'error');
        return { success: false, error };
    }
}

    
    // --- Gemini API Integration ---
    const API_KEY = ""; // PASTE YOUR GEMINI API KEY HERE
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

    async function callGemini(payload, retries = 3, delay = 1000) {
         try {
             const response = await fetch(GEMINI_API_URL, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(payload)
             });
             if (!response.ok) {
                 if (response.status === 429 && retries > 0) {
                     console.warn(`Gemini API throttled. Retrying in ${delay / 1000}s...`);
                     await new Promise(res => setTimeout(res, delay));
                     return callGemini(payload, retries - 1, delay * 2);
                 }
                 throw new Error(`API Error: ${response.status} ${response.statusText}`);
             }
             return await response.json();
         } catch (error) {
             console.error("Error calling Gemini API:", error);
             showToast("Gemini AI feature is not available. API key may be missing or invalid.", "error");
             throw error;
         }
     }
    
    async function generateTasksForProject(projectName) {
        const systemPrompt = "You are a project management assistant. Based on the project name, generate a list of 3 to 5 high-level tasks to get started. Respond only with a valid JSON array of objects. Each object should have two keys: 'taskName' (a string) and 'priority' (a string which must be one of 'High', 'Medium', or 'Low'). Do not include any other text or markdown formatting.";
        const userQuery = `Project Name: "${projectName}"`;
        const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { taskName: { type: "STRING" }, priority: { type: "STRING", enum: ["High", "Medium", "Low"] } }, required: ["taskName", "priority"] } } } };
        const result = await callGemini(payload);
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generatedText) return JSON.parse(generatedText);
        else throw new Error("Failed to generate tasks. Response was empty.");
    }

    async function suggestSubtasks(taskName) {
        const systemPrompt = "You are a helpful assistant. Provide a short list of sub-tasks or important notes for the given main task. Use bullet points (using '-') for the list. Keep the response concise and actionable.";
        const userQuery = `Task: "${taskName}"`;
        const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
        const result = await callGemini(payload);
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generatedText) return generatedText;
        else throw new Error("Failed to suggest sub-tasks. Response was empty.");
    }

    // --- UI & Helper Functions ---
    function showToast(message, type = 'success') {
        const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
        const toast = document.createElement('div');
        toast.className = `fixed top-5 right-5 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg transform transition-transform duration-300 translate-x-full z-50`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.remove('translate-x-full'); }, 10);
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function setButtonLoading(button, isLoading) {
        const buttonText = button.querySelector('.button-text');
        const loader = button.querySelector('.loader');
        button.disabled = isLoading;
        if (isLoading) {
            buttonText.textContent = 'Generating...';
            loader.classList.remove('hidden');
        } else {
            buttonText.textContent = button.dataset.originalText;
            loader.classList.add('hidden');
        }
    }

    feather.replace();

    // --- Sidebar Logic ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleDesktop = document.getElementById('sidebar-toggle-desktop');
    const sidebarToggleMobile = document.getElementById('sidebar-toggle-mobile');
    const sidebarTexts = document.querySelectorAll('.sidebar-text');
    const toggleSidebar = () => {
        sidebar.classList.toggle('w-64');
        sidebar.classList.toggle('w-20');
        sidebarTexts.forEach(text => text.classList.toggle('hidden'));
    };
    if(sidebarToggleDesktop) sidebarToggleDesktop.addEventListener('click', toggleSidebar);
    if(sidebarToggleMobile) sidebarToggleMobile.addEventListener('click', () => sidebar.classList.toggle('w-64'));

    // --- Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    const showSection = (hash) => {
        contentSections.forEach(s => s.classList.toggle('hidden', '#' + s.id !== hash));
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === hash));
    };
    navLinks.forEach(link => link.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = link.getAttribute('href');
    }));
    window.addEventListener('hashchange', () => showSection(window.location.hash || '#dashboard'));
    
    // --- Modal Logic ---
    const modalTriggers = {'add-task-btn': 'add-task-modal', 'add-project-btn': 'add-project-modal', 'add-member-btn': 'add-member-modal'};
    Object.keys(modalTriggers).forEach(btnId => {
        const btn = document.getElementById(btnId);
        const modal = document.getElementById(modalTriggers[btnId]);
        if (btn && modal) btn.addEventListener('click', () => modal.style.display = 'flex');
    });
    document.querySelectorAll('.close-modal, #cancel-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => e.target.closest('.fixed').style.display = 'none');
    });
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) e.target.style.display = 'none'; });

    // --- Kanban Board Logic ---
    let draggedItem = null;
    function addDragAndDropListenersToTaskCards() {
        const taskCards = document.querySelectorAll('.task-card');
        taskCards.forEach(card => {
            card.addEventListener('dragstart', () => {
                draggedItem = card;
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            card.addEventListener('dragend', () => {
                if (draggedItem) draggedItem.classList.remove('dragging');
                draggedItem = null;
            });
        });

        const kanbanColumns = document.querySelectorAll('.kanban-column');
        kanbanColumns.forEach(column => {
            column.addEventListener('dragover', e => {
                e.preventDefault();
                const afterElement = getDragAfterElement(column, e.clientY);
                if (draggedItem) column.insertBefore(draggedItem, afterElement);
            });
            column.addEventListener('drop', async (e) => {
                e.preventDefault();
                if (!draggedItem) return;
                
                const taskNo = draggedItem.dataset.taskNo;
                const newStatusMap = {
                    'todo-column': 'To Do',
                    'inprogress-column': 'In Progress',
                    'review-column': 'Review',
                    'done-column': 'Done'
                };
                const newStatus = newStatusMap[column.id];
                
                const taskToUpdate = allTasks.find(t => t.TaskNo === taskNo);
                if (taskToUpdate && taskToUpdate.TaskStatus !== newStatus) {
                  taskToUpdate.TaskStatus = newStatus;
await updateSheetData("UPDATE", "Tasks", taskToUpdate);
setTimeout(loadAllData, 500); // reload to keep Sheets + UI in sync
renderKanban(allTasks);   // refresh Kanban
renderTable(allTasks);    // refresh Table
renderDashboard();        // refresh Dashboard

                }
            });
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset: offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // --- View Switcher Logic ---
    const setupViewSwitcher = (buttons, views) => {
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                views.forEach((view, i) => view.classList.toggle('hidden', i !== index));
            });
        });
    };
    setupViewSwitcher(
        [document.getElementById('board-view-btn'), document.getElementById('table-view-btn')],
        [document.getElementById('kanban-view'), document.getElementById('table-view')]
    );
    setupViewSwitcher(
        [document.getElementById('project-card-view-btn'), document.getElementById('project-list-view-btn')],
        [document.getElementById('project-card-view'), document.getElementById('project-list-view')]
    );

    // --- Dark/Light Mode Logic ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const darkModeToggleSwitch = document.getElementById('dark-mode-toggle');
    const sunIcon = `<i data-feather="sun" class="w-6 h-6"></i>`;
    const moonIcon = `<i data-feather="moon" class="w-6 h-6"></i>`;
    const applyTheme = (isDark) => {
        document.documentElement.classList.toggle('dark-mode', isDark);
        themeToggleBtn.innerHTML = isDark ? sunIcon : moonIcon;
        darkModeToggleSwitch.checked = isDark;
        feather.replace();
    }
    themeToggleBtn.addEventListener('click', () => {
        const isDark = !document.documentElement.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark);
        applyTheme(isDark);
    });
    darkModeToggleSwitch.addEventListener('change', (e) => {
        localStorage.setItem('darkMode', e.target.checked);
        applyTheme(e.target.checked);
    });
    applyTheme(localStorage.getItem('darkMode') === 'true');

    // --- DATA RENDERING AND MANIPULATION ---
    function renderKanban(tasks) {
        const columns = { 'To Do': document.getElementById('todo-column'), 'In Progress': document.getElementById('inprogress-column'), 'Review': document.getElementById('review-column'), 'Done': document.getElementById('done-column') };
        Object.values(columns).forEach(col => col.innerHTML = '');
        if (tasks.length === 0) {
            columns['To Do'].innerHTML = '<div class="text-center text-gray-500 py-4">No tasks found.</div>';
            return;
        }
        tasks.forEach(task => {
            const priorityColors = { High: 'bg-red-100 text-red-700', Medium: 'bg-yellow-100 text-yellow-700', Low: 'bg-green-100 text-green-700' };
            const card = document.createElement('div');
            card.className = 'task-card card bg-white p-4 rounded-lg shadow-sm border cursor-move';
            card.draggable = true;
            card.dataset.taskNo = task.TaskNo;
            card.setAttribute("data-task-id", task.TaskNo);
            card.innerHTML = `<div class="flex items-start justify-between"><div><p class="font-semibold">${task.TaskName}</p><p class="text-sm text-gray-500">${task.Project}</p></div><div class="flex-shrink-0 flex items-center space-x-1"><button class="p-1 text-gray-400 hover:text-blue-600 edit-task-btn" data-task-no="${task.TaskNo}"><i data-feather="edit-2" class="w-4 h-4"></i></button><button class="p-1 text-gray-400 hover:text-red-600 delete-task-btn" data-task-no="${task.TaskNo}"><i data-feather="trash-2" class="w-4 h-4"></i></button></div></div><div class="flex items-center justify-between mt-2"><span class="px-2 py-1 text-xs ${priorityColors[task.Priority] || 'bg-gray-100'} rounded-full">${task.Priority}</span><img src="https://placehold.co/24x24/E2E8F0/4A5568?text=${(task.TaskOwner || ' ').charAt(0)}" class="rounded-full" title="${task.TaskOwner}"></div>`;
            columns[task.TaskStatus]?.appendChild(card);
        });
        feather.replace();
        addDragAndDropListenersToTaskCards();
    }
    
    function renderTable(tasks) {
        const tableBody = document.getElementById('task-table-body');
        tableBody.innerHTML = '';
        if (tasks.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4">No tasks found.</td></tr>';
            return;
        }
        tasks.forEach(task => {
            const priorityColors = { High: 'bg-red-100 text-red-700', Medium: 'bg-yellow-100 text-yellow-700', Low: 'bg-green-100 text-green-700' };
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';
            row.innerHTML = `<td class="p-3">${task.TaskNo}</td><td class="p-3 font-semibold">${task.TaskName}</td><td class="p-3">${task.Project}</td><td class="p-3"><span class="px-2 py-1 text-xs ${priorityColors[task.Priority] || 'bg-gray-100'} rounded-full">${task.Priority}</span></td><td class="p-3">${task.TaskStatus}</td><td class="p-3">${task.EndDate}</td><td class="p-3">${task.TaskOwner}</td><td class="p-3 flex items-center space-x-2"><button class="p-1 text-gray-500 hover:text-blue-600 edit-task-btn" data-task-no="${task.TaskNo}"><i data-feather="edit-2" class="w-4 h-4"></i></button><button class="p-1 text-gray-500 hover:text-red-600 delete-task-btn" data-task-no="${task.TaskNo}"><i data-feather="trash-2" class="w-4 h-4"></i></button></td>`;
            tableBody.appendChild(row);
        });
        feather.replace();
    }
    
    function populateTableFilters() {
        const projectFilter = document.getElementById('filter-project');
        const priorityFilter = document.getElementById('filter-priority');
        const ownerFilter = document.getElementById('filter-owner');
        const projects = [...new Set(allTasks.map(t => t.Project))].filter(Boolean);
        const priorities = [...new Set(allTasks.map(t => t.Priority))].filter(Boolean);
        const owners = [...new Set(allTasks.map(t => t.TaskOwner))].filter(Boolean);
        projectFilter.innerHTML = '<option value="">All Projects</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
        priorityFilter.innerHTML = '<option value="">All Priorities</option>' + priorities.map(p => `<option value="${p}">${p}</option>`).join('');
        ownerFilter.innerHTML = '<option value="">All Owners</option>' + owners.map(o => `<option value="${o}">${o}</option>`).join('');
    }

    function applyTableFilters() {
        const project = document.getElementById('filter-project').value;
        const priority = document.getElementById('filter-priority').value;
        const owner = document.getElementById('filter-owner').value;
        const filteredTasks = allTasks.filter(task => (!project || task.Project === project) && (!priority || task.Priority === priority) && (!owner || task.TaskOwner === owner));
        renderTable(filteredTasks);
    }
    
    function openEditModal(taskNo) {
        const task = allTasks.find(t => t.TaskNo === taskNo);
        if (!task) return;
        const modal = document.getElementById('edit-task-modal');
        const form = document.getElementById('edit-task-form');
        form.elements.TaskNo.value = task.TaskNo;
        form.elements.TaskNo.value = task.TaskNo;
        form.elements.Project.value = task.Project || '';
        form.elements.TaskName.value = task.TaskName || '';
        form.elements.StartDate.value = task.StartDate || '';
        form.elements.EndDate.value = task.EndDate || '';
        form.elements.Priority.value = task.Priority || '';
        form.elements.TaskOwner.value = task.TaskOwner || '';
        form.elements.TaskStatus.value = task.TaskStatus || '';
        form.elements.Notes.value = task.Notes || '';
        const ownerSelect = form.elements.TaskOwner;
ownerSelect.innerHTML = '<option value="">Select Owner</option>' + 
    allTeamMembers.map(m => `<option value="${m.FullName}">${m.FullName}</option>`).join('');
ownerSelect.value = task.TaskOwner || '';
        // 🔹 Show the modal
   modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

    async function handleEditFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = Object.fromEntries(new FormData(form).entries());

    const result = await updateSheetData("UPDATE", "Tasks", formData);

    if (result.success) {
        const idx = allTasks.findIndex(t => t.TaskNo === formData.TaskNo);
        if (idx !== -1) allTasks[idx] = formData;

        renderKanban(allTasks);
        renderTable(allTasks);
        renderDashboard();
        showToast("Task updated successfully!", "success");
    }
}

    
    function confirmDeleteTask(taskNo) {
        const modal = document.getElementById('delete-confirm-modal');
        modal.style.display = 'flex';
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', async () => {
            await updateSheetData('DELETE', 'Tasks', { TaskNo: taskNo });
            modal.style.display = 'none';
            showToast('Task deleted successfully. Refreshing...', 'info');
            setTimeout(loadAllData, 500); // Give sheet a moment to update
        });
    }

    function renderProjects(projects) {
        const cardContainer = document.getElementById('project-card-container');
        const listContainer = document.getElementById('project-table-body');
        cardContainer.innerHTML = '';
        listContainer.innerHTML = '';
        if (projects.length === 0) {
            cardContainer.innerHTML = '<div class="text-center text-gray-500 py-4 col-span-full">No projects found.</div>';
            listContainer.innerHTML = '<tr><td colspan="5" class="text-center p-4">No projects found.</td></tr>';
            return;
        }
        projects.forEach(p => {
            const progress = p.Status === 'Completed' ? 100 : Math.floor(Math.random() * 61) + 20;
            const statusColor = p.Status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
            cardContainer.innerHTML += `<div class="card bg-white p-6 rounded-lg shadow-sm border hover:shadow-lg transition-shadow"><h3 class="font-bold text-lg">${p.ProjectName}</h3><p class="text-sm text-gray-500 my-2">${p.Description}</p><div class="w-full bg-gray-200 rounded-full h-2.5"><div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div></div><p class="text-xs text-gray-500 text-right mt-1">${progress}% Complete</p></div>`;
            listContainer.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-semibold">${p.ProjectName}</td><td class="p-3">${p.TeamMembers}</td><td class="p-3"><span class="px-2 py-1 text-xs ${statusColor} rounded-full">${p.Status}</span></td><td class="p-3"><div class="w-full bg-gray-200 rounded-full h-2.5"><div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div></div></td><td class="p-3">${p.Timeline}</td></tr>`;
        });
    }

    function renderTeamMembers(members) {
        const grid = document.getElementById('team-member-grid');
        grid.innerHTML = '';
        if(!members || members.length === 0) {
            grid.innerHTML = '<div class="text-center text-gray-500 py-4 col-span-full">No team members found.</div>';
            return;
        }
        members.forEach(m => {
            grid.innerHTML += `<div class="card bg-white text-center p-6 rounded-lg shadow-sm border hover:shadow-lg transition-shadow"><img src="https://placehold.co/80x80/E2E8F0/4A5568?text=${m.FullName.charAt(0)}" class="w-20 h-20 mx-auto rounded-full -mt-12 border-4 border-white"><h3 class="mt-4 font-bold text-lg">${m.FullName}</h3><p class="text-sm text-gray-500">${m.Role}</p><p class="text-xs text-gray-400 mt-2">${m.Email}</p></div>`;
        });
    }

    async function handleFormSubmit(e, action, sheetName) {
        e.preventDefault();
        const form = e.target;
        const formData = Object.fromEntries(new FormData(form).entries());
        if (action === 'CREATE' && sheetName === 'Tasks') {
            if (!formData.TaskStatus) formData.TaskStatus = 'To Do';
             if (!formData.TaskType) formData.TaskType = '';
        }
        await updateSheetData(action, sheetName, formData);
        form.reset();
        form.closest('.fixed').style.display = 'none';
        showToast('Item added successfully! Refreshing...', 'success');
        setTimeout(loadAllData, 500); // Give sheet a moment to update before refetching
    }

    // --- DATA INITIALIZATION ---
    async function loadAllData() {
        console.log("Loading all data from Google Sheet...");
        const [tasks, projects, members] = await Promise.all([
            fetchDataFromSheet('Tasks'),
            fetchDataFromSheet('Projects'),
            fetchDataFromSheet('TeamMembers')
        ]);
        allTasks = tasks;
        allProjects = projects;
        allTeamMembers = members;

        renderKanban(allTasks);
        renderTable(allTasks);
        populateTableFilters();
        renderProjects(allProjects);
        renderTeamMembers(allTeamMembers);
        renderDashboard();
        console.log("Data loaded and rendered.");
    }

    // --- DASHBOARD SPECIFIC RENDERING ---
    function updateDashboardTasks(title, tasksToShow) {
        const agendaTitle = document.querySelector('#dashboard .mt-8 h3');
        const dashboardTaskList = document.getElementById('dashboard-task-list');
        agendaTitle.textContent = title;
        dashboardTaskList.innerHTML = '';
        if (tasksToShow.length === 0) {
            dashboardTaskList.innerHTML = `<p class="text-gray-500 text-center py-4">No matching tasks found.</p>`;
            return;
        }
        tasksToShow.forEach(task => {
            const priorityColors = { High: 'bg-red-100 text-red-700', Medium: 'bg-yellow-100 text-yellow-700', Low: 'bg-green-100 text-green-700' };
            const isDone = task.TaskStatus === 'Done';
            const icon = isDone ? 'check-circle' : 'circle';
            const iconColor = isDone ? 'text-green-500' : (task.Priority === 'High' ? 'text-red-500' : 'text-gray-400');
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item flex items-center justify-between p-2 rounded-lg hover:bg-gray-50';
            taskItem.innerHTML = `<div class="flex items-center"> <i data-feather="${icon}" class="w-5 h-5 ${iconColor} mr-3"></i> <div> <p class="font-semibold ${isDone ? 'line-through text-gray-500' : ''}">${task.TaskName}</p> <p class="text-sm text-gray-500">Project: ${task.Project}</p> </div> </div> <span class="px-2 py-1 text-xs ${priorityColors[task.Priority] || 'bg-gray-100'} rounded-full">${task.Priority}</span>`;
            dashboardTaskList.appendChild(taskItem);
        });
        feather.replace();
    }

    function updateDashboardWithProjects(title, projectsToShow) {
        const agendaTitle = document.querySelector('#dashboard .mt-8 h3');
        const dashboardList = document.getElementById('dashboard-task-list');
        agendaTitle.textContent = title;
        dashboardList.innerHTML = '';
        if (projectsToShow.length === 0) {
            dashboardList.innerHTML = `<p class="text-gray-500 text-center py-4">No active projects found.</p>`;
            return;
        }
        projectsToShow.forEach(project => {
            const statusColor = project.Status === 'Completed' ? 'text-green-500' : 'text-blue-500';
            const item = document.createElement('div');
            item.className = 'task-item flex items-center justify-between p-2 rounded-lg hover:bg-gray-50';
            item.innerHTML = `<div class="flex items-center"> <i data-feather="folder" class="w-5 h-5 ${statusColor} mr-3"></i> <div> <p class="font-semibold">${project.ProjectName}</p> <p class="text-sm text-gray-500">Team: ${project.TeamMembers}</p> </div> </div> <span class="text-sm text-gray-600">Due: ${project.Timeline}</span>`;
            dashboardList.appendChild(item);
        });
        feather.replace();
    }

    function renderDefaultAgenda() {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        const todaysTasks = allTasks.filter(t => t.EndDate === todayString && t.TaskStatus !== 'Done');
        const criticalTasks = allTasks.filter(t => t.Priority === 'High' && t.TaskStatus !== 'Done');
        const agendaTasks = [...todaysTasks, ...criticalTasks];
        const uniqueAgendaTasks = Array.from(new Set(agendaTasks.map(a => a.TaskNo))).map(taskNo => agendaTasks.find(a => a.TaskNo === taskNo));
        updateDashboardTasks("Today's Agenda", uniqueAgendaTasks.slice(0,5));
    }

    function renderDashboard() {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        const todaysTasks = allTasks.filter(t => t.EndDate === todayString && t.TaskStatus !== 'Done');
        const criticalTasks = allTasks.filter(t => t.Priority === 'High' && t.TaskStatus !== 'Done');
        const newTasks = allTasks.filter(t => t.TaskStatus === 'To Do');
        const activeProjects = allProjects.filter(p => p.Status === 'In Progress');
        document.getElementById('today-tasks-count').textContent = todaysTasks.length;
        document.getElementById('critical-tasks-count').textContent = criticalTasks.length;
        document.getElementById('new-tasks-count').textContent = newTasks.length;
        document.getElementById('active-projects-count').textContent = activeProjects.length;
        renderDefaultAgenda();
    }

    // --- INITIAL LOAD AND EVENT LISTENERS ---
    showSection(window.location.hash || '#dashboard');
    loadAllData();

    document.querySelector('.main-content').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-task-btn');
        if (editBtn) openEditModal(editBtn.dataset.taskNo);
        const deleteBtn = e.target.closest('.delete-task-btn');
        if (deleteBtn) confirmDeleteTask(deleteBtn.dataset.taskNo);
    });
    // Form Submissions
    document.getElementById('add-task-form').addEventListener('submit', (e) => handleFormSubmit(e, 'CREATE', 'Tasks'));
    document.getElementById('edit-task-form').addEventListener('submit', handleEditFormSubmit);
    document.getElementById('add-project-form').addEventListener('submit', (e) => handleFormSubmit(e, 'CREATE', 'Projects'));
    document.getElementById('add-member-form').addEventListener('submit', (e) => handleFormSubmit(e, 'CREATE', 'TeamMembers'));
    // Table Filter Listeners
    document.getElementById('table-filters').addEventListener('change', applyTableFilters);
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        document.getElementById('filter-project').value = "";
        document.getElementById('filter-priority').value = "";
        document.getElementById('filter-owner').value = "";
        applyTableFilters();
    });
    // Dashboard Card Click Logic
    document.getElementById('today-tasks-card').addEventListener('click', () => {
        const todayString = new Date().toISOString().split('T')[0];
        updateDashboardTasks("Today's Tasks", allTasks.filter(t => t.EndDate === todayString && t.TaskStatus !== 'Done'));
    });
    document.getElementById('critical-tasks-card').addEventListener('click', () => {
        updateDashboardTasks("Critical Tasks", allTasks.filter(t => t.Priority === 'High' && t.TaskStatus !== 'Done'));
    });
    document.getElementById('new-tasks-card').addEventListener('click', () => {
        updateDashboardTasks("New Tasks (To Do)", allTasks.filter(t => t.TaskStatus === 'To Do'));
    });
    document.getElementById('active-projects-card').addEventListener('click', () => {
        updateDashboardWithProjects("Active Projects", allProjects.filter(p => p.Status === 'In Progress'));
    });
    document.getElementById('show-all-tasks').addEventListener('click', renderDefaultAgenda);

    // Gemini Feature Event Listeners
    const generateTasksBtn = document.getElementById('generate-tasks-btn');
    generateTasksBtn.dataset.originalText = generateTasksBtn.querySelector('.button-text').textContent;
    generateTasksBtn.addEventListener('click', async () => {
        const projectName = document.getElementById('new-project-name').value.trim();
        if (!projectName) {
            showToast("Please enter a project name first.", "info");
            return;
        }
        setButtonLoading(generateTasksBtn, true);
        try {
            const newTasks = await generateTasksForProject(projectName);
            // Create tasks one by one
            for (const [index, task] of newTasks.entries()) {
                 const newId = `T-${Date.now()}-${index}`;
                 const owner = allTeamMembers.length > 0 ? allTeamMembers[index % allTeamMembers.length].FullName : '';
                 const taskData = { TaskNo: newId, TaskName: task.taskName, Project: projectName, Priority: task.priority, TaskStatus: 'To Do', EndDate: '', TaskOwner: owner };
                 await updateSheetData('CREATE', 'Tasks', taskData);
            }
            showToast(`${newTasks.length} tasks generated for "${projectName}"! Refreshing...`, 'success');
            setTimeout(loadAllData, 500);
        } catch (error) {
            showToast("Error generating tasks. Please try again.", "error");
        } finally {
            setButtonLoading(generateTasksBtn, false);
        }
    });

    const suggestSubtasksBtn = document.getElementById('suggest-subtasks-btn');
    suggestSubtasksBtn.dataset.originalText = suggestSubtasksBtn.querySelector('.button-text').textContent;
    suggestSubtasksBtn.addEventListener('click', async () => {
        const taskName = document.getElementById('new-task-name').value.trim();
        if (!taskName) {
            showToast("Please enter a task name first.", "info");
            return;
        }
        const notesTextarea = document.getElementById('task-notes');
        setButtonLoading(suggestSubtasksBtn, true);
        try {
            notesTextarea.value = await suggestSubtasks(taskName);
        } catch (error) {
            showToast("Error generating suggestions. Please try again.", "error");
        } finally {
            setButtonLoading(suggestSubtasksBtn, false);
        }
    });

});









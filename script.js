// 存储已添加的地址
const addedAddresses = new Set();

// 本地存储键名
const STORAGE_KEY = 'eth_addresses_data';

// 从本地存储加载数据
function loadFromStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            const parsed = JSON.parse(data);
            // 恢复已保存的地址集合
            addedAddresses.clear();
            parsed.forEach(item => addedAddresses.add(item.address.toLowerCase()));
            return parsed;
        } catch (e) {
            console.error('加载本地数据失败:', e);
        }
    }
    return [];
}

// 添加防抖，避免频繁保存
let saveTimeout;
function saveToStorage() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const rows = document.querySelectorAll('#ethTable tbody tr');
        const data = Array.from(rows)
            .map(row => {
                const addressInput = row.querySelector('.address');
                const descInput = row.querySelector('.description');
                const fullAddress = addressInput.dataset.fullAddress;
                
                if (fullAddress && ethers.utils.isAddress(fullAddress)) {
                    return {
                        address: fullAddress,
                        description: descInput.value,
                        balance: row.querySelector('.balance').textContent,
                        txCount: row.querySelector('.txCount').textContent
                    };
                }
                return null;
            })
            .filter(item => item !== null);
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, 500); // 500ms 延迟
}

// 格式化地址显示（显示前8位和后4位）
function formatAddress(address) {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

// 添加双击删除功能 - 简化版本
function handleDelete(tr, address) {
    const deleteBtn = tr.querySelector('.delete-btn');
    let lastClickTime = 0;
    
    deleteBtn.onclick = (e) => {
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < 500) { // 调整为500ms，使双击更容易
            if (address) {
                addedAddresses.delete(address.toLowerCase());
            }
            tr.remove();
            updateRowNumbers();
            saveToStorage();
        }
        lastClickTime = currentTime;
    };
}

// 验证并格式化地址
function validateAndFormatAddress(addressInput) {
    const addr = addressInput.value.trim();
    if (!addr) {
        addressInput.classList.remove('error');
        return false;
    }

    // 验证地址格式
    if (!ethers.utils.isAddress(addr)) {
        addressInput.classList.add('error');
        showToast('无效的ETH地址');
        return false;
    }

    const lowerAddr = addr.toLowerCase();
    const currentFullAddr = addressInput.dataset.fullAddress;

    // 检查重复（排除当前输入框自身的值）
    if (addedAddresses.has(lowerAddr) && currentFullAddr?.toLowerCase() !== lowerAddr) {
        addressInput.classList.add('error');
        showToast('地址已存在');
        return false;
    }

    // 更新地址显示和存储
    if (currentFullAddr) {
        addedAddresses.delete(currentFullAddr.toLowerCase());
    }

    addressInput.dataset.fullAddress = addr;
    addressInput.title = addr;
    addedAddresses.add(lowerAddr);
    addressInput.classList.remove('error');

    // 只在失去焦点时格式化显示
    if (!addressInput.matches(':focus')) {
        addressInput.value = formatAddress(addr);
    }

    return true;
}

// 修改查询功能，移除 gas 相关代码
async function queryAddressInfo(address, row) {
    try {
        const provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/f4ca76ba3b7145c8aab1ed9a384adb7b');
        
        const balanceCell = row.querySelector('.balance');
        const txCountCell = row.querySelector('.txCount');
        const refreshBtn = row.querySelector('.refresh-btn');
        
        // 添加加载状态
        refreshBtn.classList.add('loading');
        const loadingSpinner = document.createElement('div');
        loadingSpinner.className = 'loading-spin';
        refreshBtn.textContent = '';
        refreshBtn.appendChild(loadingSpinner);
        refreshBtn.disabled = true;

        // 并行查询余额和交易次数
        const [balance, txCount] = await Promise.all([
            provider.getBalance(address),
            provider.getTransactionCount(address)
        ]);

        // 格式化余额（转换为ETH）
        const ethBalance = ethers.utils.formatEther(balance);
        balanceCell.textContent = parseFloat(ethBalance).toFixed(4);

        // 显示交易次数
        txCountCell.textContent = txCount;

        // 查询完成后恢复刷新按钮
        refreshBtn.classList.remove('loading');
        refreshBtn.textContent = '';  // 清空按钮内容
        refreshBtn.disabled = false;

    } catch (error) {
        console.error('查询失败:', error);
        if (error.message.includes('rate limit')) {
            showToast('查询频率过高，请稍后再试');
        } else if (error.message.includes('network')) {
            showToast('网络连接失败，请检查网络');
        } else {
            showToast('查询失败，请稍后重试');
        }
        if (balanceCell && txCountCell) {
            balanceCell.textContent = 'Failed';
            txCountCell.textContent = 'Failed';
        }
        
        // 错误时也恢复刷新按钮
        refreshBtn.classList.remove('loading');
        refreshBtn.textContent = '';
        refreshBtn.disabled = false;
    }

    // 保存更新后的数据
    saveToStorage();

    // 在查询完成后更新统计信息
    updateStats();
}

// 修改添加行函数，移除 gas 相关代码并添加复选框
function addNewRow(data = {}) {
    const tbody = document.querySelector('#ethTable tbody');
    if (!tbody) return;
    
    const rowCount = tbody.children.length + 1;
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
        <td class="checkbox-column">
            <input type="checkbox" class="row-checkbox">
        </td>
        <td>${rowCount}</td>
        <td><input type="text" class="description" maxlength="6" placeholder="说明" value="${data.description || ''}"></td>
        <td>
            <input type="text" class="address" placeholder="输入ETH地址" 
                   value="${data.address ? formatAddress(data.address) : ''}" 
                   data-full-address="${data.address || ''}"
                   title="${data.address || ''}">
        </td>
        <td class="balance">${data.balance || '-'}</td>
        <td class="txCount">${data.txCount || '-'}</td>
        <td class="actions">
            <button class="refresh-btn"></button>
            <button class="delete-btn"></button>
        </td>
    `;
    
    // 绑定删除按钮事件
    handleDelete(tr, data.address);

    // 绑定输入框变化事件
    tr.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', saveToStorage);
    });
    
    // 修改地址输入框的焦点事件处理
    const addressInput = tr.querySelector('.address');
    
    // 添加焦点事件
    addressInput.addEventListener('focus', () => {
        const fullAddr = addressInput.dataset.fullAddress;
        if (fullAddr) {
            addressInput.value = fullAddr;
        }
    });

    // 添加失焦事件
    addressInput.addEventListener('blur', () => {
        if (addressInput.value.trim()) {
            if (validateAndFormatAddress(addressInput)) {
                saveToStorage();
            }
        }
    });

    // 添加输入事件 - 自动清理空格和换行
    addressInput.addEventListener('input', (e) => {
        const cleanValue = e.target.value.replace(/[\s\n]/g, '');
        if (cleanValue !== e.target.value) {
            e.target.value = cleanValue;
        }
    });
    
    tbody.appendChild(tr);
    
    // 添加分页更新
    updatePagination();

    // 如果有地址，立即验证并格式化示
    if (data.address) {
        addressInput.value = data.address;
        if (validateAndFormatAddress(addressInput)) {
            saveToStorage();
        }
    }

    // 修改件，使其为唯一的刷新触发方式
    const refreshBtn = tr.querySelector('.refresh-btn');
    refreshBtn.onclick = () => {
        const addr = tr.querySelector('.address').dataset.fullAddress;
        if (addr && ethers.utils.isAddress(addr)) {
            queryAddressInfo(addr, tr);
        } else {
            showToast('请先输入有效的ETH地址');
        }
    };

    // 添加行悬停效果
    tr.addEventListener('mouseenter', () => {
        tr.querySelector('.actions').style.opacity = '1';
    });
    tr.addEventListener('mouseleave', () => {
        tr.querySelector('.actions').style.opacity = '0.5';
    });
}

// 更新行号
function updateRowNumbers() {
    updatePagination(); // 直接使用分页的行号更新
}

// 添加提示的函数
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    // 使用 setTimeout 确保过渡动画生效
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 自动隐藏
    setTimeout(() => {
        toast.classList.remove('show');
        // 等待过渡动画完成后隐藏素
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, duration);
}

// 修改批量导入处理函数
function handleBatchImport() {
    const textarea = document.getElementById('importAddresses');
    const addresses = textarea.value
        .split(/[\s,，\n]+/)  // 支持更多分隔符
        .map(addr => addr.trim())
        .filter(addr => addr);

    if (addresses.length === 0) {
        showToast('请输入要导入的地址');
        return;
    }

    let imported = 0;
    let invalidAddresses = [];
    let duplicateAddresses = [];

    addresses.forEach(addr => {
        // 验证地址格式
        if (!ethers.utils.isAddress(addr)) {
            invalidAddresses.push(addr);
            return;
        }

        // 检查重复
        if (addedAddresses.has(addr.toLowerCase())) {
            duplicateAddresses.push(addr);
            return;
        }

        // 创建新行
        addNewRow({ address: addr });
        imported++;
    });

    // 显示导入结果
    let message = [];
    if (imported > 0) {
        message.push(`成功导入 ${imported} 个地址`);
    }
    if (invalidAddresses.length > 0) {
        message.push(`${invalidAddresses.length} 个无效地址`);
    }
    if (duplicateAddresses.length > 0) {
        message.push(`${duplicateAddresses.length} 个重复地址`);
    }

    // 关闭弹窗并显示结果
    document.getElementById('importDialog').classList.add('hidden');
    textarea.value = '';
    showToast(message.join('，'));
    
    // 保存到本地存储
    saveToStorage();
}

// 添加标题保存功能
function setupTitleEdit() {
    const titleInput = document.getElementById('pageTitle');
    const TITLE_KEY = 'eth_page_title';

    // 载保存的标题
    const savedTitle = localStorage.getItem(TITLE_KEY);
    if (savedTitle) {
        titleInput.value = savedTitle;
        document.title = savedTitle; // 更新浏览器标签
    }

    // 保存标题
    titleInput.addEventListener('change', () => {
        const newTitle = titleInput.value.trim() || 'ETH地址信息查询';
        localStorage.setItem(TITLE_KEY, newTitle);
        document.title = newTitle;
    });
}

// 添加停止查询标志
let isQueryingStopped = false;

// 修改查询所有地址的函数
async function queryAllAddresses() {
    const BATCH_SIZE = 5; // 修改为每批查询5个地址
    const DELAY = 1000;   // 批次间延迟1秒
    
    const rows = document.querySelectorAll('#ethTable tbody tr');
    const queryAllBtn = document.getElementById('queryAll');
    const stopQueryBtn = document.getElementById('stopQuery');
    const originalBtnText = queryAllBtn.textContent;
    
    // 先统计有效地址总数
    const validRows = Array.from(rows).filter(row => {
        const address = row.querySelector('.address').dataset.fullAddress;
        return address && ethers.utils.isAddress(address);
    });
    
    let completedCount = 0;
    let totalAddresses = validRows.length;
    let startTime = Date.now();
    let currentBatch = [];
    
    // 如果没有有效地址，直接返回
    if (totalAddresses === 0) {
        showToast('没有可查询的地址');
        return;
    }

    // 重置停止标志
    isQueryingStopped = false;

    // 显示停止按钮，隐藏查询按钮
    queryAllBtn.classList.add('hidden');
    stopQueryBtn.classList.remove('hidden');
    
    // 绑定停止按钮事件
    stopQueryBtn.onclick = () => {
        isQueryingStopped = true;
        showToast('正在停止查询...');
    };

    // 更新进度显示
    function updateProgress() {
        const elapsed = Date.now() - startTime;
        const avgTimePerAddress = completedCount > 0 ? elapsed / completedCount : 0;
        const remaining = Math.round((totalAddresses - completedCount) * avgTimePerAddress / 1000);
        stopQueryBtn.textContent = `查询中 ${completedCount}/${totalAddresses} (约${remaining}秒)`;
    }

    // 批量处理地址
    for (let i = 0; i < validRows.length; i++) {
        if (isQueryingStopped) {
            showToast(`已停止查询，完成: ${completedCount}/${totalAddresses}`);
            break;
        }

        const row = validRows[i];
        const address = row.querySelector('.address').dataset.fullAddress;
        currentBatch.push({ row, address });

        // 当达到批处理大小或是最后一个地址时，执行批量查询
        if (currentBatch.length === BATCH_SIZE || i === validRows.length - 1) {
            try {
                // 并行查询当前批次
                await Promise.all(currentBatch.map(async ({ row, address }) => {
                    try {
                        await queryAddressInfo(address, row);
                        completedCount++;
                        updateProgress();
                    } catch (error) {
                        console.error('查询失败:', error);
                        const balanceCell = row.querySelector('.balance');
                        const txCountCell = row.querySelector('.txCount');
                        const refreshBtn = row.querySelector('.refresh-btn');
                        
                        balanceCell.textContent = '-';
                        txCountCell.textContent = '-';
                        refreshBtn.classList.remove('loading');
                        refreshBtn.textContent = '';
                        refreshBtn.disabled = false;
                    }
                }));

                // 添加延时避免API限制
                if (i < validRows.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY));
                }
                currentBatch = [];
            } catch (error) {
                console.error('批量查询失败:', error);
            }
        }
    }

    // 恢复按钮状态
    queryAllBtn.classList.remove('hidden');
    stopQueryBtn.classList.add('hidden');
    queryAllBtn.textContent = originalBtnText;
    stopQueryBtn.textContent = '停止查询';

    if (!isQueryingStopped) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        showToast(`查询完成，成功: ${completedCount}/${totalAddresses}，用时: ${elapsed}秒`);
    }

    // 更新统计信息
    updateStats();
}

// 读取本件
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const addresses = text.split(/[\n,]/).map(addr => addr.trim()).filter(addr => addr);
            resolve(addresses);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// 修改 Excel 取函数
async function readExcelFile(file) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const items = [];
        
        // 获取工作表的有效范围
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        
        // 遍历一行
        for (let row = range.s.r; row <= range.e.r; row++) {
            // 获取地址单元格（第一列）
            const addressCell = worksheet[XLSX.utils.encode_cell({r: row, c: 0})];
            // 获取说明单元格（第二列）
            const descCell = worksheet[XLSX.utils.encode_cell({r: row, c: 1})];
            
            if (addressCell && addressCell.v) {
                const address = addressCell.v.toString().trim();
                const description = descCell ? descCell.v.toString().trim() : '';
                
                if (address) {
                    items.push({
                        address: address,
                        description: description
                    });
                }
            }
        }
        
        return items;
    } catch (error) {
        console.error('Excel 文件处理失败:', error);
        throw new Error('Excel 文件处理失败');
    }
}

// 修改文件导入处理函数
function setupFileImport() {
    const fileInput = document.getElementById('addressFile');
    const fileImportBtn = document.getElementById('fileImport');

    fileImportBtn.onclick = () => fileInput.click();

    fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;

        try {
            let items = [];
            
            if (file.name.toLowerCase().endsWith('.xlsx')) {
                items = await readExcelFile(file);
            } else if (file.name.toLowerCase().endsWith('.txt')) {
                const addresses = await readTextFile(file);
                items = addresses.map(addr => ({ address: addr, description: '' }));
            } else {
                showToast('不支持的文格式');
                return;
            }

            // 过滤并导入地址
            let imported = 0;
            let invalidAddresses = [];
            let duplicateAddresses = [];

            items.forEach(item => {
                const addr = item.address;
                if (!addr) return;

                if (!ethers.utils.isAddress(addr)) {
                    invalidAddresses.push(addr);
                    return;
                }

                if (addedAddresses.has(addr.toLowerCase())) {
                    duplicateAddresses.push(addr);
                    return;
                }

                addNewRow({
                    address: addr,
                    description: item.description.substring(0, 6) // 限制说明长度为6个字符
                });
                imported++;
            });

            // 显示导入结果
            let message = [];
            if (imported > 0) {
                message.push(`成功导入 ${imported} 个地址`);
            }
            if (invalidAddresses.length > 0) {
                message.push(`${invalidAddresses.length} 个无效地址`);
            }
            if (duplicateAddresses.length > 0) {
                message.push(`${duplicateAddresses.length} 个重复地址`);
            }

            // 清空文件入并显示结果
            fileInput.value = '';
            showToast(message.join('，'));
            
            // 保存到本地存储
            saveToStorage();

        } catch (error) {
            console.error('文件理失败:', error);
            showToast('文件处理失败');
        }
    };
}

// 修改批量删除相关功能
function setupBatchDelete() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const batchDeleteBtn = document.getElementById('batchDelete');
    let isSelecting = false;

    // 选/取消全选
    selectAllCheckbox.onchange = () => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
            checkbox.closest('tr').classList.toggle('selected', selectAllCheckbox.checked);
        });
        updateBatchDeleteButton();
    };

    // 执行删除操作
    function executeDelete() {
        const selectedRows = document.querySelectorAll('.row-checkbox:checked');
        if (selectedRows.length > 0) {
            selectedRows.forEach(checkbox => {
                const tr = checkbox.closest('tr');
                const addressInput = tr.querySelector('.address');
                if (addressInput?.dataset.fullAddress) {
                    addedAddresses.delete(addressInput.dataset.fullAddress.toLowerCase());
                }
                tr.remove();
            });
            updateRowNumbers();
            saveToStorage();
            showToast(`删除 ${selectedRows.length} 行`);
            
            // 更新统计信息
            updateStats();
        }
        // 重置按钮状态
        isSelecting = false;
        batchDeleteBtn.classList.remove('active');
        batchDeleteBtn.textContent = '批量删除';
        selectAllCheckbox.checked = false;
        document.querySelectorAll('.row-checkbox, #selectAll').forEach(checkbox => {
            checkbox.style.display = 'none';
        });
    }

    // 切换批量删除模式
    batchDeleteBtn.onclick = () => {
        isSelecting = !isSelecting;
        batchDeleteBtn.classList.toggle('active', isSelecting);
        document.querySelectorAll('.row-checkbox, #selectAll').forEach(checkbox => {
            checkbox.style.display = isSelecting ? 'inline-block' : 'none';
        });
        
        if (isSelecting) {
            batchDeleteBtn.textContent = '删除选中';
        } else {
            const selectedCount = document.querySelectorAll('.row-checkbox:checked').length;
            if (selectedCount > 0) {
                // 显示确认对话框
                document.getElementById('deleteCount').textContent = selectedCount;
                document.getElementById('confirmDeleteDialog').classList.remove('hidden');
            } else {
                // 如果没有选中任何行，直接重置状态
                batchDeleteBtn.textContent = '批量删除';
                selectAllCheckbox.checked = false;
            }
        }
    };

    // 确认删除
    document.getElementById('confirmDelete').onclick = () => {
        document.getElementById('confirmDeleteDialog').classList.add('hidden');
        executeDelete();
    };

    // 取消删除
    document.getElementById('cancelDelete').onclick = 
    document.getElementById('closeConfirmDialog').onclick = () => {
        document.getElementById('confirmDeleteDialog').classList.add('hidden');
        // 重置选择状态
        isSelecting = false;
        batchDeleteBtn.classList.remove('active');
        batchDeleteBtn.textContent = '批量删除';
        document.querySelectorAll('.row-checkbox, #selectAll').forEach(checkbox => {
            checkbox.style.display = 'none';
            checkbox.checked = false;
        });
        document.querySelectorAll('tr.selected').forEach(tr => {
            tr.classList.remove('selected');
        });
    };

    // 听单复选框的变化
    document.querySelector('#ethTable tbody').addEventListener('change', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            e.target.closest('tr').classList.toggle('selected', e.target.checked);
            updateBatchDeleteButton();
        }
    });
}

// 更新批量删除按钮状态
function updateBatchDeleteButton() {
    const selectedCount = document.querySelectorAll('.row-checkbox:checked').length;
    const batchDeleteBtn = document.getElementById('batchDelete');
    if (batchDeleteBtn.classList.contains('active')) {
        batchDeleteBtn.textContent = selectedCount > 0 ? 
            `删除选中(${selectedCount})` : '删除选中';
    }
}

// 添加价格询和统计功能
async function fetchEthPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=cny');
        const data = await response.json();
        return data.ethereum.cny;
    } catch (error) {
        console.error('获取ETH价格失败:', error);
        return null;
    }
}

// 修改统计能，添加钱包数量统计
async function updateStats() {
    const totalWalletsSpan = document.getElementById('totalWallets');
    const totalEthSpan = document.getElementById('totalEth');
    const totalValueSpan = document.getElementById('totalValue');

    // 添加加载状态
    totalWalletsSpan.textContent = 'loading...';
    totalEthSpan.textContent = 'loading...';
    totalValueSpan.textContent = 'loading...';

    try {
        // 算钱包数量和ETH总额
        let totalEth = 0;
        const rows = document.querySelectorAll('#ethTable tbody tr');
        const validWallets = Array.from(rows).filter(row => {
            const addressInput = row.querySelector('.address');
            return addressInput?.dataset.fullAddress && 
                   ethers.utils.isAddress(addressInput.dataset.fullAddress);
        });

        // 更新钱包数量
        totalWalletsSpan.textContent = validWallets.length;

        // 计算ETH总额
        validWallets.forEach(row => {
            const balanceText = row.querySelector('.balance').textContent;
            if (balanceText !== '-' && balanceText !== 'Failed') {
                totalEth += parseFloat(balanceText) || 0;
            }
        });

        // 新ETH总额显示
        totalEthSpan.textContent = totalEth < 0.0001 ? 
            '<0.0001 ETH' : 
            totalEth.toFixed(4) + ' ETH';

        try {
            // 获取ETH价格并计算总价值
            const ethPrice = await fetchEthPrice();
            if (ethPrice) {
                const totalValue = totalEth * ethPrice;
                totalValueSpan.textContent = '¥' + totalValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
            } else {
                totalValueSpan.textContent = '-';
            }
        } catch (priceError) {
            console.error('获取价格失败:', priceError);
            totalValueSpan.textContent = '-';
        }
    } catch (error) {
        console.error('更新统计信息失败:', error);
        totalWalletsSpan.textContent = '-';
        totalEthSpan.textContent = '-';
        totalValueSpan.textContent = '-';
    }
}

// 添加分页功能
let currentPage = 1;
let pageSize = 10;

// 修改分页设置，添加本地存储
const PAGE_SIZE_KEY = 'eth_page_size';

// 修改 setupPagination 函数
function setupPagination() {
    // 从本地存储加载页面大小设置
    const savedPageSize = localStorage.getItem(PAGE_SIZE_KEY);
    if (savedPageSize) {
        pageSize = parseInt(savedPageSize);
        document.getElementById('pageSize').value = savedPageSize;
    }

    // 页码切换按
    document.getElementById('firstPage').onclick = () => {
        currentPage = 1;
        updatePagination();
    };

    document.getElementById('prevPage').onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            updatePagination();
        }
    };

    document.getElementById('nextPage').onclick = () => {
        const totalPages = Math.ceil(document.querySelectorAll('#ethTable tbody tr').length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            updatePagination();
        }
    };

    document.getElementById('lastPage').onclick = () => {
        const totalPages = Math.ceil(document.querySelectorAll('#ethTable tbody tr').length / pageSize);
        currentPage = totalPages;
        updatePagination();
    };

    // 修改页大小变化处理
    document.getElementById('pageSize').onchange = (e) => {
        pageSize = parseInt(e.target.value);
        localStorage.setItem(PAGE_SIZE_KEY, pageSize.toString());
        currentPage = 1; // 切换每页显示数量时重置到第一页
        updatePagination();
    };
}

// 修改统计面板点击事件
function setupStats() {
    const statsPanel = document.querySelector('.stats-panel');
    
    // 点击统计面板刷新数据
    statsPanel.onclick = () => {
        updateStats();
        showToast('正在更新统计信息...');
    };
}

// 修改复制地址功能
function setupCopyAddresses() {
    const copyBtn = document.getElementById('copyAddresses');
    
    copyBtn.onclick = () => {
        const tbody = document.querySelector('#ethTable tbody');
        const allRows = tbody.querySelectorAll('tr');
        
        // 收集所有地址
        const addresses = Array.from(allRows)
            .map(row => {
                const addressInput = row.querySelector('.address');
                return addressInput.dataset.fullAddress || '';
            })
            .filter(addr => addr);

        if (addresses.length === 0) {
            showToast('没有可复制的地址');
            return;
        }

        // 复制到剪贴板
        navigator.clipboard.writeText(addresses.join('\n'))
            .then(() => {
                showToast(`已复制 ${addresses.length} 个地址`);
            })
            .catch(err => {
                console.error('复制失败:', err);
                // 提供备用复制方案
                const textarea = document.createElement('textarea');
                textarea.value = addresses.join('\n');
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast(`已复制 ${addresses.length} 个地址`);
            });
    };
}

// 在初始化代码中添加新功能
document.addEventListener('DOMContentLoaded', () => {
    // 设置标题编辑
    setupTitleEdit();
    
    // 加载保存的数据
    const savedData = loadFromStorage();
    if (savedData.length > 0) {
        savedData.forEach(item => {
            addNewRow(item);
        });
    } else {
        addNewRow(); // 添加第一行
    }

    // 绑定钮事件
    document.getElementById('addRow').onclick = () => addNewRow();
    
    // 批量导入按钮
    document.getElementById('batchImport').onclick = () => {
        document.getElementById('importDialog').classList.remove('hidden');
        document.getElementById('importAddresses').value = '';
    };

    // 导入按钮
    document.getElementById('confirmImport').onclick = handleBatchImport;

    // 关闭按钮
    document.getElementById('closeDialog').onclick = () => {
        document.getElementById('importDialog').classList.add('hidden');
    };

    // 添加查询所有按钮事件
    document.getElementById('queryAll').onclick = queryAllAddresses;

    // 设置文件导功能
    setupFileImport();

    // 设置批量删除功能
    setupBatchDelete();
    
    // 初始隐藏复选框
    document.querySelectorAll('.row-checkbox, #selectAll').forEach(checkbox => {
        checkbox.style.display = 'none';
    });

    // 设置统计信新
    document.getElementById('refreshStats').onclick = updateStats;
    
    // 在查询完所有地址后更新统计
    const originalQueryAll = document.getElementById('queryAll').onclick;
    document.getElementById('queryAll').onclick = async () => {
        await originalQueryAll();
        updateStats();
    };

    // 初始更新统计信息
    updateStats();

    // 设置分页功能
    setupPagination();
    
    // 初始更新分页
    updatePagination();

    // 置统计面板点击事件
    setupStats();
    
    // 设置复制地址功能
    setupCopyAddresses();

    // 在页面加载时也应该恢复保存的页码
    const savedPage = localStorage.getItem(PAGE_NUM_KEY);
    if (savedPage) {
        currentPage = parseInt(savedPage);
    }
});

// 更新分页显示
function updatePagination() {
    // 缓存 DOM 元素
    const tbody = document.querySelector('#ethTable tbody');
    const rows = Array.from(tbody.querySelectorAll('tr')); // 为数组，避免重复查询
    const currentPageEl = document.getElementById('currentPage');
    const totalPagesEl = document.getElementById('totalPages');
    const firstPageBtn = document.getElementById('firstPage');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const lastPageBtn = document.getElementById('lastPage');
    
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / pageSize);

    // 更新页码显示
    currentPageEl.textContent = currentPage;
    totalPagesEl.textContent = totalPages;

    // 更新按钮状态
    firstPageBtn.disabled = currentPage === 1;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    lastPageBtn.disabled = currentPage === totalPages;

    // 显示当前页��行
    rows.forEach((row, index) => {
        const shouldShow = index >= (currentPage - 1) * pageSize && index < currentPage * pageSize;
        row.classList.toggle('hidden-row', !shouldShow);
    });

    // 更新行号
    const visibleRows = tbody.querySelectorAll('tr:not(.hidden-row)');
    visibleRows.forEach((row, index) => {
        row.cells[1].textContent = (currentPage - 1) * pageSize + index + 1;
    });

    // 添加当前页记忆功能
    const PAGE_NUM_KEY = 'eth_current_page';
    localStorage.setItem(PAGE_NUM_KEY, currentPage.toString());
}

// 使用事件委托，减少事件监听器数量
function setupTableEvents() {
    const tbody = document.querySelector('#ethTable tbody');
    
    tbody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('refresh-btn')) {
            const row = target.closest('tr');
            const addr = row.querySelector('.address').dataset.fullAddress;
            if (addr && ethers.utils.isAddress(addr)) {
                queryAddressInfo(addr, row);
            }
        } else if (target.classList.contains('delete-btn')) {
            const row = target.closest('tr');
            handleDelete(row);
        }
    });
}

// 使用文档片段优化批量DOM操作
function updateVisibleRows() {
    const tbody = document.querySelector('#ethTable tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const fragment = document.createDocumentFragment();
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    
    rows.forEach((row, index) => {
        if (index >= start && index < end) {
            row.classList.remove('hidden-row');
            row.cells[1].textContent = index + 1;
            fragment.appendChild(row);
        } else {
            row.classList.add('hidden-row');
        }
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}
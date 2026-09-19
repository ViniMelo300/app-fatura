(function(){

  const MONTHS_INDEX_KEY = 'fatura_months_index';
  const MEMBERS_KEY = 'fatura_members';

  if(window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function monthKeyFrom(label){
    return 'fatura_month_' + label.trim().toLowerCase().replace(/\s+/g,'_');
  }

  function safeGet(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  }
  function safeSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){ /* ignore */ }
  }

  function loadMonthData(label){
    const raw = safeGet(monthKeyFrom(label), null);
    if(Array.isArray(raw)) return { transactions: raw, invoiceTotal: null }; // formato antigo
    if(raw && typeof raw === 'object') return { transactions: raw.transactions || [], invoiceTotal: raw.invoiceTotal ?? null };
    return { transactions: [], invoiceTotal: null };
  }

  function defaultMonthLabel(){
    const d = new Date();
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return meses[d.getMonth()] + ' de ' + d.getFullYear();
  }

  let members = safeGet(MEMBERS_KEY, []);
  let currentMonthLabel = defaultMonthLabel();
  let initialData = loadMonthData(currentMonthLabel);
  let transactions = initialData.transactions;
  let invoiceTotal = initialData.invoiceTotal;
  let idCounter = 1;
  transactions.forEach(t => { if(t.id >= idCounter) idCounter = t.id + 1; });

  const membersListEl = document.getElementById('membersList');
  const newMemberInput = document.getElementById('newMemberInput');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const pasteArea = document.getElementById('pasteArea');
  const parseBtn = document.getElementById('parseBtn');
  const addManualBtn = document.getElementById('addManualBtn');
  const fileInput = document.getElementById('fileInput');
  const txBody = document.getElementById('txBody');
  const emptyState = document.getElementById('emptyState');
  const summaryGrid = document.getElementById('summaryGrid');
  const unassignedNote = document.getElementById('unassignedNote');
  const monthLabelInput = document.getElementById('monthLabel');
  const saveMonthBtn = document.getElementById('saveMonthBtn');
  const clearBtn = document.getElementById('clearBtn');
  const savedMonthsWrap = document.getElementById('savedMonthsWrap');
  const savedMonthsEl = document.getElementById('savedMonths');
  const toastEl = document.getElementById('toast');
  const totalGeralValueEl = document.getElementById('totalGeralValue');
  const invoiceTotalInput = document.getElementById('invoiceTotalInput');
  const matchStatusEl = document.getElementById('matchStatus');

  monthLabelInput.value = currentMonthLabel;
  if(invoiceTotal !== null) invoiceTotalInput.value = fmt(invoiceTotal);

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'), 1800);
  }

  function fmt(v){
    return v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function parseValue(str){
    let s = String(str).replace(/[Rr]\$/,'').trim();
    s = s.replace(/\./g,'').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // ---------- Membros ----------
  function renderMembers(){
    membersListEl.innerHTML = '';
    if(members.length === 0){
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.margin = '0';
      p.textContent = 'Ainda não há ninguém na lista.';
      membersListEl.appendChild(p);
    }
    members.forEach(m => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<span>${escapeHtml(m.name)}</span>`;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.title = 'Remover ' + m.name;
      btn.addEventListener('click', () => {
        members = members.filter(x => x.id !== m.id);
        transactions.forEach(t => { if(t.owner === m.id) t.owner = ''; });
        safeSet(MEMBERS_KEY, members);
        renderMembers(); renderTable(); renderSummary();
      });
      chip.appendChild(btn);
      membersListEl.appendChild(chip);
    });
  }

  addMemberBtn.addEventListener('click', () => {
    const name = newMemberInput.value.trim();
    if(!name) return;
    members.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2,6), name });
    safeSet(MEMBERS_KEY, members);
    newMemberInput.value = '';
    renderMembers(); renderTable();
  });
  newMemberInput.addEventListener('keydown', e => { if(e.key === 'Enter') addMemberBtn.click(); });

  // ---------- Parser de texto (colado ou extraído de arquivo) ----------
  function parseStatement(text){
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
    const found = [];
    lines.forEach(line => {
      let delim = null;
      if(line.includes(';')) delim = ';';
      else if(line.includes('\t')) delim = '\t';
      else if((line.match(/,/g)||[]).length >= 2 && /\d,\d{2}\s*$/.test(line) === false) delim = ',';

      if(delim){
        const parts = line.split(delim).map(s => s.trim()).filter(s => s.length);
        if(parts.length >= 2){
          let valueIdx = -1, value = null;
          for(let i = parts.length - 1; i >= 0; i--){
            const v = parseValue(parts[i]);
            if(v !== null){ value = v; valueIdx = i; break; }
          }
          if(value !== null){
            let dateIdx = -1, date = '';
            for(let i = 0; i < parts.length; i++){
              if(/^\d{2}\/\d{2}(\/\d{2,4})?$/.test(parts[i])){ date = parts[i]; dateIdx = i; break; }
            }
            const descParts = parts.filter((p,i) => i !== valueIdx && i !== dateIdx);
            found.push({ date, description: descParts.join(' ') || '(sem descrição)', value });
            return;
          }
        }
      }

      const dateMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)/);
      const valueMatch = line.match(/(-?\s?R?\$?\s?-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
      if(valueMatch){
        const value = parseValue(valueMatch[1]);
        if(value !== null){
          let desc = line;
          if(dateMatch) desc = desc.slice(dateMatch[0].length);
          desc = desc.slice(0, desc.length - valueMatch[0].length).trim();
          desc = desc.replace(/^[-–;,\s]+|[-–;,\s]+$/g, '');
          found.push({ date: dateMatch ? dateMatch[1] : '', description: desc || '(sem descrição)', value: Math.abs(value) });
        }
      }
    });
    return found;
  }

  function addParsedTransactions(found, sourceLabel){
    if(found.length === 0){
      showToast('Não consegui reconhecer lançamentos ' + sourceLabel + '.');
      return;
    }
    found.forEach(f => {
      transactions.push({ id: idCounter++, date: f.date, description: f.description, value: f.value, owner: '' });
    });
    renderTable(); renderSummary();
    showToast(found.length + ' lançamento(s) importado(s) ' + sourceLabel + '.');
  }

  parseBtn.addEventListener('click', () => {
    const text = pasteArea.value;
    if(!text.trim()) return;
    addParsedTransactions(parseStatement(text), 'do texto colado');
    pasteArea.value = '';
  });

  addManualBtn.addEventListener('click', () => {
    transactions.push({ id: idCounter++, date: '', description: '', value: 0, owner: '' });
    renderTable(); renderSummary();
  });

  // ---------- Importar arquivo (PDF ou CSV) ----------
  async function extractPdfText(file){
    if(!window.pdfjsLib) throw new Error('pdf.js não carregado');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let full = '';
    for(let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY = null, line = '';
      const lines = [];
      content.items.forEach(item => {
        const y = item.transform[5];
        if(lastY !== null && Math.abs(y - lastY) > 2){
          lines.push(line);
          line = '';
        }
        line += (line ? ' ' : '') + item.str;
        lastY = y;
      });
      if(line) lines.push(line);
      full += lines.join('\n') + '\n';
    }
    return full;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if(!file) return;
    showToast('Lendo arquivo…');
    try{
      let text;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      text = isPdf ? await extractPdfText(file) : await file.text();
      addParsedTransactions(parseStatement(text), 'de "' + file.name + '"');
    }catch(err){
      console.error(err);
      showToast('Não consegui ler esse arquivo — tente colar o texto manualmente.');
    }finally{
      fileInput.value = '';
    }
  });

  // ---------- Tabela ----------
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderTable(){
    txBody.innerHTML = '';
    emptyState.style.display = transactions.length ? 'none' : 'block';

    transactions.forEach(t => {
      const tr = document.createElement('tr');

      const tdDate = document.createElement('td');
      const dateInput = document.createElement('input');
      dateInput.type = 'text'; dateInput.value = t.date; dateInput.placeholder = 'dd/mm';
      dateInput.addEventListener('input', () => { t.date = dateInput.value; });
      tdDate.appendChild(dateInput);

      const tdDesc = document.createElement('td');
      const descInput = document.createElement('input');
      descInput.type = 'text'; descInput.value = t.description;
      descInput.addEventListener('input', () => { t.description = descInput.value; });
      tdDesc.appendChild(descInput);

      const tdVal = document.createElement('td');
      const valInput = document.createElement('input');
      valInput.type = 'text'; valInput.className = 'val';
      valInput.value = fmt(t.value);
      valInput.addEventListener('change', () => {
        const parsed = parseValue(valInput.value) ?? parseFloat(valInput.value.replace(',', '.'));
        t.value = isNaN(parsed) ? 0 : Math.abs(parsed);
        valInput.value = fmt(t.value);
        renderSummary();
      });
      tdVal.appendChild(valInput);

      const tdOwner = document.createElement('td');
      const sel = document.createElement('select');
      const optNone = document.createElement('option');
      optNone.value = ''; optNone.textContent = '— não atribuído —';
      sel.appendChild(optNone);
      members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.name;
        if(t.owner === m.id) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => { t.owner = sel.value; renderSummary(); });
      tdOwner.appendChild(sel);

      const tdDel = document.createElement('td');
      tdDel.className = 'col-del';
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = 'Remover lançamento';
      delBtn.addEventListener('click', () => {
        transactions = transactions.filter(x => x.id !== t.id);
        renderTable(); renderSummary();
      });
      tdDel.appendChild(delBtn);

      tr.append(tdDate, tdDesc, tdVal, tdOwner, tdDel);
      txBody.appendChild(tr);
    });
  }

  // ---------- Resumo ----------
  function renderSummary(){
    summaryGrid.innerHTML = '';

    if(members.length === 0){
      summaryGrid.innerHTML = '<p class="hint" style="margin:0;">Adicione familiares acima para ver o resumo por pessoa.</p>';
    } else {
      members.forEach(m => {
        const txs = transactions.filter(t => t.owner === m.id);
        const total = txs.reduce((s,t) => s + t.value, 0);

        const card = document.createElement('div');
        card.className = 'person-card';

        const head = document.createElement('div');
        head.className = 'head';
        head.innerHTML = `<span class="name">${escapeHtml(m.name)}</span><span class="total">R$ ${fmt(total)}</span>`;

        const count = document.createElement('div');
        count.className = 'count';
        count.textContent = txs.length + (txs.length === 1 ? ' compra' : ' compras');

        const actions = document.createElement('div');
        actions.className = 'actions';
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'ghost';
        toggleBtn.textContent = 'Ver mensagem';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'primary';
        copyBtn.textContent = 'Copiar mensagem';

        const preview = document.createElement('div');
        preview.className = 'msg-preview';
        const message = buildMessage(m, txs, total);
        preview.textContent = message;

        toggleBtn.addEventListener('click', () => preview.classList.toggle('open'));
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(message).then(() => {
            showToast('Mensagem de ' + m.name + ' copiada.');
          }).catch(() => showToast('Não foi possível copiar — selecione o texto manualmente.'));
        });

        actions.append(toggleBtn, copyBtn);
        card.append(head, count, actions, preview);
        summaryGrid.appendChild(card);
      });
    }

    const unassigned = transactions.filter(t => !t.owner);
    if(unassigned.length){
      const total = unassigned.reduce((s,t) => s + t.value, 0);
      unassignedNote.textContent = `${unassigned.length} lançamento(s) sem responsável, totalizando R$ ${fmt(total)} (ficam com você).`;
    } else {
      unassignedNote.textContent = '';
    }

    updateTotals();
  }

  function buildMessage(member, txs, total){
    const lines = [`Fatura de ${currentMonthLabel} — ${member.name}`, ''];
    if(txs.length === 0){
      lines.push('Nenhuma compra registrada neste mês.');
    } else {
      txs.forEach(t => {
        const datePart = t.date ? t.date + '  ' : '';
        lines.push(`${datePart}${t.description}  R$ ${fmt(t.value)}`);
      });
    }
    lines.push('');
    lines.push(`Total: R$ ${fmt(total)}`);
    return lines.join('\n');
  }

  // ---------- Total geral e conferência com a fatura ----------
  function updateTotals(){
    const total = transactions.reduce((s,t) => s + t.value, 0);
    totalGeralValueEl.textContent = 'R$ ' + fmt(total);

    if(invoiceTotal === null || isNaN(invoiceTotal)){
      matchStatusEl.textContent = '';
      matchStatusEl.className = 'match-status';
      return;
    }
    const diff = Math.round((total - invoiceTotal) * 100) / 100;
    if(Math.abs(diff) < 0.01){
      matchStatusEl.textContent = '✓ Bate certinho com o valor da fatura.';
      matchStatusEl.className = 'match-status ok';
    } else if(diff > 0){
      matchStatusEl.textContent = `⚠ Está R$ ${fmt(diff)} acima do valor da fatura — confira se algum lançamento está duplicado.`;
      matchStatusEl.className = 'match-status warn';
    } else {
      matchStatusEl.textContent = `⚠ Está R$ ${fmt(Math.abs(diff))} abaixo do valor da fatura — falta lançar alguma compra.`;
      matchStatusEl.className = 'match-status warn';
    }
  }

  invoiceTotalInput.addEventListener('input', () => {
    const v = parseValue(invoiceTotalInput.value);
    invoiceTotal = (v === null) ? null : Math.abs(v);
    updateTotals();
  });

  // ---------- Meses ----------
  function renderSavedMonths(){
    const index = safeGet(MONTHS_INDEX_KEY, []);
    savedMonthsWrap.style.display = index.length ? 'block' : 'none';
    savedMonthsEl.innerHTML = '';
    index.forEach(label => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', () => loadMonth(label));
      savedMonthsEl.appendChild(btn);
    });
  }

  function loadMonth(label){
    currentMonthLabel = label;
    monthLabelInput.value = label;
    const data = loadMonthData(label);
    transactions = data.transactions;
    invoiceTotal = data.invoiceTotal;
    invoiceTotalInput.value = invoiceTotal !== null ? fmt(invoiceTotal) : '';
    idCounter = 1;
    transactions.forEach(t => { if(t.id >= idCounter) idCounter = t.id + 1; });
    renderTable(); renderSummary();
    showToast('Mês "' + label + '" carregado.');
  }

  saveMonthBtn.addEventListener('click', () => {
    currentMonthLabel = monthLabelInput.value.trim() || defaultMonthLabel();
    safeSet(monthKeyFrom(currentMonthLabel), { transactions, invoiceTotal });
    const index = safeGet(MONTHS_INDEX_KEY, []);
    if(!index.includes(currentMonthLabel)){
      index.push(currentMonthLabel);
      safeSet(MONTHS_INDEX_KEY, index);
    }
    renderSavedMonths();
    renderSummary();
    showToast('Mês "' + currentMonthLabel + '" salvo.');
  });

  clearBtn.addEventListener('click', () => {
    if(!confirm('Remover todos os lançamentos deste mês (na tela)? Isso não apaga meses já salvos.')) return;
    transactions = [];
    invoiceTotal = null;
    invoiceTotalInput.value = '';
    renderTable(); renderSummary();
  });

  // ---------- Inicialização ----------
  renderMembers();
  renderTable();
  renderSummary();
  renderSavedMonths();

})();

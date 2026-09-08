# UniMercatorum Dispense Downloader (Estensione Chrome / Edge)

Estensione browser (Manifest V3) per scaricare in modo automatico e ordinato sul tuo PC tutte le dispense PDF delle videolezioni della piattaforma e-learning UniMercatorum / Multiversity (`lms.mercatorum.multiversity.click`).

---

## 🚀 Come Installare l'Estensione (Google Chrome o Microsoft Edge)

L'installazione richiede meno di 1 minuto:

1. **Apri la gestione delle estensioni nel tuo browser**:
   - Su **Google Chrome**: digita nella barra degli indirizzi `chrome://extensions` e premi Invio.
   - Su **Microsoft Edge**: digita nella barra degli indirizzi `edge://extensions` e premi Invio.

2. **Attiva la "Modalità sviluppatore"**:
   - In alto a destra attiva l'interruttore **Modalità sviluppatore** (Developer Mode).

3. **Carica l'estensione**:
   - Clicca sul pulsante **Carica estensione non pacchettizzata** (o *Load unpacked*).
   - Seleziona questa cartella del progetto:
     ```text
     c:\Users\giovanni\Desktop\progetti\app unimercatorum
     ```

4. **Fatto!** L'estensione `UniMercatorum Dispense Downloader` è ora attiva nel tuo browser.

---

## 📖 Come Utilizzare l'Estensione

1. **Vai sulla piattaforma UniMercatorum**:
   - Apri una qualsiasi pagina delle videolezioni del tuo corso, ad esempio:
     `https://lms.mercatorum.multiversity.click/videolezioni/...`

2. **Apri il Pannello Downloader**:
   - In basso a destra noterai un pulsante pill elegante: **📥 UniMercatorum Downloader**.
   - Cliccalo per aprire il pannello di controllo.

3. **Seleziona la tua Cartella**:
   - Clicca su **Seleziona Cartella del PC**.
   - Scegli la cartella sul tuo computer dove vuoi salvare tutti i PDF.
   - Conferma il permesso di scrittura richiesto da Chrome/Edge.

4. **Scegli il Capitolo di Partenza**:
   - I capitoli vengono rilevati automaticamente.
   - Dal menu a tendina seleziona da quale capitolo vuoi iniziare (es. *Cap. 9 - Le coniche*).
   - Se desideri puoi impostare anche il capitolo finale.

5. **Avvia il Download**:
   - Clicca su **▶️ Avvia Download**.
   - L'estensione aprirà in sequenza le tendine, individuerà per ciascuna la riga **Dispensa**, cliccherà **Visualizza**, scaricherà il PDF e lo salverà nella tua cartella locale con il nome ordinato:
     `Cap. 09 - Le coniche.pdf`
   - I file già presenti vengono sovrascritti come da tua preferenza.

---

## ⚙️ Caratteristiche Tecniche

- **Zero Credenziali salvate**: Funziona direttamente all'interno della tua sessione già autenticata nel browser.
- **Salvataggio Nativo**: Utilizza le moderne `File System Access API` (`window.showDirectoryPicker()`) senza passare per la cartella temporanea dei download.
- **Pausa di Sicurezza (Anti-Rate-Limiting)**: Pausa predefinita di 1.5 secondi tra un capitolo e l'altro per rispettare i server dell'università.
- **Controlli Pausa & Stop**: Puoi mettere in pausa o interrompere in qualsiasi momento.

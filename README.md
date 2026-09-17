# UniMercatorum Suite (Dispense Downloader & Video Auto-Player)

Estensione browser (Manifest V3) per Google Chrome e Microsoft Edge progettata per la piattaforma e-learning UniMercatorum / Multiversity (`lms.mercatorum.multiversity.click`).

Include due moduli integrati:
1. **📥 Dispense PDF**: Scarica in modo automatico e ordinato sul tuo PC tutte le dispense PDF delle lezioni.
2. **🎬 Auto-Play Video**: Riproduce in sequenza i video didattici, monitora il completamento al 100%, apre automaticamente i capitoli successivi e consente la regolazione di velocità e muto.

---

## 🚀 Come Installare o Aggiornare l'Estensione

1. Apri la gestione estensioni:
   - Su **Chrome**: `chrome://extensions`
   - Su **Edge**: `edge://extensions`
2. Attiva la **Modalità sviluppatore** (in alto a destra).
3. Se l'hai già caricata, clicca semplicemente sul pulsante circolare **Aggiorna (🔄)**.
4. Se è la prima installazione, clicca su **Carica estensione non pacchettizzata** e seleziona questa cartella del progetto:
   ```text
   c:\Users\giovanni\Desktop\progetti\app unimercatorum
   ```

---

## 📖 Come Utilizzare la Riproduzione Automatica Video

1. **Apri una videolezione del corso** su UniMercatorum.
2. **Clicca sul pulsante flottante** in basso a destra (🎓 UniMercatorum Tool).
3. **Seleziona la scheda "🎬 Auto-Play Video"** in alto nel pannello.
4. **Configura le opzioni desiderate**:
   - **Sezione del Corso**: Seleziona se riprodurre tutto il corso in sequenza o una specifica macro-sezione.
   - **Velocità video**: 1.0x (consigliato per evitare disconnessioni del server e garantire la certificazione delle presenze).
   - **Muto**: Attivo di default (consigliato per evitare blocchi dell'autoplay da parte del browser).
   - **Salta video già al 100%**: Salta automaticamente le lezioni già completate in precedenza.
   - **Modalità Notte**: Mantiene lo schermo attivo (`Screen Wake Lock API`) e previene la sospensione del PC per l'esecuzione continua notturna.
5. **Clicca su "🎬 Avvia Riproduzione"**:
   - L'estensione gestirà automaticamente l'apertura delle macro-sezioni e dei capitoli (a fisarmonica/mutua esclusione), avvierà i video e ne monitorerà l'avanzamento.
   - Non appena la barra raggiunge il **100%**, attenderà la sincronizzazione della piattaforma e passerà automaticamente al video successivo.
   - Puoi usare in qualsiasi momento i tasti **Pausa**, **Stop** o **⏭️ Salta** per avanzare manualmente al video successivo.

---

## 📖 Come Utilizzare il Download Dispense PDF

1. Clicca sulla scheda **"📥 Dispense PDF"**.
2. Clicca su **Seleziona Cartella del PC** e scegli dove salvare i PDF.
3. Seleziona i capitoli e clicca su **▶️ Avvia Download**.
4. I file verranno salvati in ordine progressivo direttamente nella cartella scelta.

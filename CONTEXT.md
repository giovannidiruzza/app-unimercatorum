# UniMercatorum Material Downloader

Strumento per l'acquisizione e il salvataggio automatico e strutturato sul computer locale del materiale didattico (dispense PDF delle videolezioni) fornito dalla piattaforma e-learning di Universitas Mercatorum.

## Language

**Piattaforma**:
Il portale e-learning ufficiale di UniMercatorum da cui gli studenti fruiscono le videolezioni e scaricano le dispense.
_Avoid_: Sito, server, LMS esterno

**Insegnamento**:
La singola materia accademica (corso di laurea) a cui lo studente è iscritto.
_Avoid_: Corso, esame, materia

**Capitolo**:
Unità tematica numerata (es. "9 - Le coniche", "10 - Introduzione...") racchiusa in una tendina a fisarmonica all'interno di una macro-categoria. Al suo interno contiene l'elenco delle videolezioni, gli eventuali test e, in calce come ultimo elemento, la voce **Dispensa**.
_Avoid_: Sezione generica, singola lezione

**Lezione**:
La singola videolezione contenuta all'interno di un capitolo (es. "La retta", "Ellissi").
_Avoid_: Video, capitolo

**Dispensa**:
Il file PDF riassuntivo o di slide collocato in fondo a ciascun capitolo con etichetta "Dispensa" e pulsante "Visualizza". Esiste una dispensa ufficiale per ciascun capitolo.
_Avoid_: Documento, file, appunto

**Pulsante Visualizza**:
L'elemento interattivo (bottone/link con etichetta "Visualizza") posizionato sulla riga "Dispensa" che attiva l'apertura o il download del documento PDF.
_Avoid_: Tasto download, link generico

**Pannello di Controllo**:
Il widget grafico flottante iniettato direttamente all'interno della pagina dell'insegnamento per gestire la selezione cartella, il capitolo di partenza e il monitoraggio del download.
_Avoid_: Finestra modale, popup esterno

**Punto di Partenza**:
Il numero di capitolo (es. capitolo 9, 10, ecc.) selezionato dall'utente da cui avviare sequenzialmente l'apertura delle tendine e il download delle dispense.
_Avoid_: Offset, indice di ripresa

**Cartella di Destinazione**:
La directory sul filesystem del PC scelta esplicitamente dall'utente tramite selettore nativo, in cui vengono salvate direttamente tutte le dispense.
_Avoid_: Percorso temporaneo, cartella predefinita senza consenso

**Convenzione di File Flat**:
Schema di denominazione lineare dei file salvati direttamente nella cartella di destinazione (es. `Cap. 09 - Le coniche.pdf`), senza annidamento in sottocartelle.
_Avoid_: Albero di sottocartelle, nomi file anonimi

**Regola di Sovrascrittura**:
Comportamento di salvataggio che sovrascrive sempre i file PDF esistenti con lo stesso nome nella cartella di destinazione.
_Avoid_: Skip automatico, rinomina automatica con suffisso



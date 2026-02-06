// Script to check IndexedDB leads
(async () => {
  const dbName = 'princhat_db';
  const request = indexedDB.open(dbName);
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    const tx = db.transaction('kanban_leads', 'readonly');
    const store = tx.objectStore('kanban_leads');
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      console.log('=== ALL LEADS IN DATABASE ===');
      console.log(JSON.stringify(getAllRequest.result, null, 2));
    };
  };
})();

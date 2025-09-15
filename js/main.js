const API_URL = 'https://script.google.com/macros/s/AKfycby6SzAgXhtctDbYEGETB6Ku8X_atugp7Mld5QvimnDpXMmHU9IxW9XRqDkRI0rGONr85Q/exec';

function buildURL(){
  const qp = new URLSearchParams();
  qp.set('op','historial');                 // 🔑 usa "op=historial"
  if(state.query) qp.set('q', state.query); // 🔑 usa "q=" para buscar
  qp.set('limit', String(state.limitLoaded||state.pageStep));
  return API_URL + '?' + qp.toString();
}

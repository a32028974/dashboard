const API_URL = 'https://script.google.com/macros/s/AKfycbyNNZx3q0zAIJ4AD3PUbwTAUw1iGENbmeL6Y2rDoxktYN9iJ3P07MnB-DL0HX-Eh_9Fwg/exec';

function buildURL(){
  const qp = new URLSearchParams();
  qp.set('op','historial');                 // 🔑 usa "op=historial"
  if(state.query) qp.set('q', state.query); // 🔑 usa "q=" para buscar
  qp.set('limit', String(state.limitLoaded||state.pageStep));
  return API_URL + '?' + qp.toString();
}

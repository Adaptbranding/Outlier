// Keep a scan tab at full speed while Chrome is in the background. Run it in the same tab, once, before or after starting a scan.
// A hidden tab is throttled by Chrome (a scan can drop to a few requests an hour); a page holding a WebRTC data channel is exempt.
// This opens a local loopback channel between two connections in the page; nothing leaves the computer.
(async () => {
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = e => e.candidate && b.addIceCandidate(e.candidate);
  b.onicecandidate = e => e.candidate && a.addIceCandidate(e.candidate);
  const dc = a.createDataChannel('keepalive');
  b.ondatachannel = e => { e.channel.onmessage = () => {}; };
  const opened = new Promise(res => { dc.onopen = () => res('open'); setTimeout(() => res('timeout'), 8000); });
  const offer = await a.createOffer(); await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
  const ans = await b.createAnswer(); await b.setLocalDescription(ans); await a.setRemoteDescription(ans);
  window.__keep = { a, b, dc, iv: setInterval(() => { try { dc.send('k'); } catch (e) { } }, 5000) };
  window.__keepState = await opened;
})();

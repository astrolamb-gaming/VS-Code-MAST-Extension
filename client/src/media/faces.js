// const vscode = acquireVsCodeApi();

// function sendResult(res) {
// 	vscode.postMessage({
// 		command: 'face',
// 		text: res
// 	})
// }
// Handle the message inside the webview
window.addEventListener('message', event => {

	const message = event.data; // The JSON data our extension sent
	let data = JSON.parse(message);
	console.log(message)
	
});
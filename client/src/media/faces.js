// const vscode = acquireVsCodeApi();

// function sendResult(res) {
// 	vscode.postMessage({
// 		command: 'face',
// 		text: res
// 	})
// }
// Handle the message inside the webview
let b = document.getElementById("button")
b.innerText = "HELP ME"
b.addEventListener("click", (evnt)=>{
	console.log("Clicked!")
});
console.log("Testing webview page")

const vscode = acquireVsCodeApi();
vscode.postMessage({
	command: 'face',
	text: "HELLO THERE"
})
window.addEventListener('message', event => {

	const message = event.data; // The JSON data our extension sent
	let data = JSON.parse(message);
	console.log(message)
	
});

function sendResult(res) {
	vscode.postMessage({
		command: 'face',
		text: res
	})
}

// Add stuff here if needed
console.log("HELLO")
sendResult("HELLO")
let count = 0;

function newMessage(){
    count++;
    document.getElementById("badge").innerText = count;

    // Browser notification
    if(Notification.permission === "granted"){
        new Notification("New Message Received!");
    }
}

// Ask permission
if(Notification.permission !== "granted"){
    Notification.requestPermission();
}
import * as wss from "./wss.js";
import * as webRTCHandler from "./webRTCHandler.js";
import * as ui from "./ui.js";

let strangerCallType;

export const changeStrangerConnectionStatus = (status) => {
    const data = { status };
    wss.changeStrangerConnectionStatus(data);
};

export const getStrangerSocketIdAndConnect = (callType) => {
    strangerCallType = callType;
    wss.getStrangerSocketId();
};

export const connectWithStranger = (data) => {
    console.log(data.randomStrangerSocketId);
    if (data.randomStrangerSocketId) {
        console.log("call type in strager utils ==");
        console.log(strangerCallType);
        webRTCHandler.sendPreOffer(strangerCallType, data.randomStrangerSocketId);
    } else {
        // no user is available for connection
        ui.showNoStrangerAvailableDialog();
    }
};

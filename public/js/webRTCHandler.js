import * as wss from './wss.js';
import * as constants from './constant.js';
import * as ui from './ui.js';
import * as store from "./store.js";


let connectedUserDetails;
let peerConnection;
let screenSharingStream;
let dataChannel;

const defaultConstraints = {
    audio: true,
    video: true
}

const configuration = {
    iceServers: [
        {
            urls: "stun:stun.1.google.com:13902"
        },
    ],
};

export const getLocalPreview = () => {
    navigator.mediaDevices
        .getUserMedia(defaultConstraints)
        .then((stream) => {
            ui.updateLocalVideo(stream);
            ui.showVideoCallButtons();
            store.setCallState(constants.callState.CALL_AVAILABLE);
            store.setLocalStream(stream);
        })
        .catch((err) => {
            console.log("error occured when trying to get access")
            console.log(err);
        })
}


const createPeerConnection = () => {
    peerConnection = new RTCPeerConnection(configuration);

    dataChannel = peerConnection.createDataChannel('chat');

    peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        dataChannel.onopen = () => {
            console.log("peer connection is ready to receive data channel messages");
        }

        dataChannel.onmessage = (event) => {
            console.log("message came from data channel");
            const message = JSON.parse(event.data);
            console.log(message);
            ui.appendMessage(message);
        };
    };





    peerConnection.onicecandidate = (event) => {
        console.log('greeting ice candidates from stun server')
        if (event.candidate) {
            //sending ice candidates to other peer
            wss.sendDataUsingWebRTCSignaling({
                connectedUserSocketId: connectedUserDetails.socketId,
                type: constants.webRTCSignaling.ICE_CANDIDATE,
                candidate: event.candidate,
            })
        }
    }

    peerConnection.onconnectionstatechange = (event) => {
        if (peerConnection.connectionState === 'connected') {
            console.log('successfully connected with other peer');
        }
    }

    //receiving tracks
    const remoteStream = new MediaStream();
    store.setRemoteStream(remoteStream);
    ui.updateRemoteVideo(remoteStream);

    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
    }

    //add our stream to peer connection

    if (connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE ||
        connectedUserDetails.callType === constants.callType.VIDEO_STRANGER) {
        const localStream = store.getState().localStream;
        for (const track of localStream.getTracks()) {
            peerConnection.addTrack(track, localStream);
        }
    }
};

export const sendMessageUsingDataChannel = (message) => {
    const stringifiedMessage = JSON.stringify(message);
    dataChannel.send(stringifiedMessage);
}


export const sendPreOffer = (callType, calleePersonalCode) => {
    connectedUserDetails = {
        callType,
        socketId: calleePersonalCode,
    };
    if (callType === constants.callType.CHAT_PERSONAL_CODE ||
        constants.callType.VIDEO_PERSONAL_CODE) {
        const data = {
            callType,
            calleePersonalCode,
        }
        ui.showCallingDialog(callingDailogRejectCallHandler);
        store.setCallState(constants.callState.CALL_UNAVAILABLE);
        wss.sendPreOffer(data);
    }

    if (
        callType === constants.callType.CHAT_STRANGER ||
        callType === constants.callType.VIDEO_STRANGER
    ) {
        const data = {
            callType,
            calleePersonalCode,
        };
        store.setCallState(constants.callState.CALL_UNAVAILABLE);
        wss.sendPreOffer(data);
    }
};

export const handlePreOffer = (data) => {
    const { callType, callerSocketId } = data;



    if (!checkCallPossibility()) {
        return sendPreOfferAnswer(constants.preOfferAnswer.CALL_UNAVAILABLE, callerSocketId);
    }

    connectedUserDetails = {
        socketId: callerSocketId,
        callType,
    };

    store.setCallState(constants.callState.CALL_UNAVAILABLE);


    if (callType === constants.callType.CHAT_PERSONAL_CODE ||
        constants.callType.VIDEO_PERSONAL_CODE) {
        ui.showIncomingCallDialog(callType, acceptCallHandler, rejectCallHandler);
    }

    if (
        callType === constants.callType.CHAT_STRANGER ||
        callType === constants.callType.VIDEO_STRANGER
    ) {
        createPeerConnection();
        sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
        ui.showCallElements(connectedUserDetails.callType);
    }
};

const acceptCallHandler = () => {
    createPeerConnection();
    // console.log('call accepted NEW BUG');
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
    // console.log(connectedUserDetails.callType);
    ui.showCallElements(connectedUserDetails.callType);


}

const rejectCallHandler = () => {
    console.log("call rejected")
    sendPreOfferAnswer();
    setIncomingCallsAvailable();
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_REJECTED);
}

const callingDailogRejectCallHandler = () => {
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId,
    };
    closePeerConnectionAndResetState();
    wss.sendUserHangedUp(data);

}

const sendPreOfferAnswer = (preOfferAnswer, callerSocketId = null) => {
    const socketId = callerSocketId ? callerSocketId : connectedUserDetails.socketId;
    const data = {
        callerSocketId: socketId,
        preOfferAnswer
    }
    ui.removeAllDialogs();
    wss.sendPreOfferAnswer(data);
}

export const handlePreOfferAnswer = (data) => {
    const { preOfferAnswer } = data;
    ui.removeAllDialogs();

    if (preOfferAnswer === constants.preOfferAnswer.CALLEE_NOT_FOUND) {
        ui.showInfoDialog(preOfferAnswer);
        setIncomingCallsAvailable();
        // show dialog that callee has not been found
    }

    if (preOfferAnswer === constants.preOfferAnswer.CALL_UNAVAILABLE) {
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        // show dialog that callee is not able to connect
    }

    if (preOfferAnswer === constants.preOfferAnswer.CALL_REJECTED) {
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        // show dialog that call is rejected by the callee
    }

    if (preOfferAnswer === constants.preOfferAnswer.CALL_ACCEPTED) {
        ui.showCallElements(connectedUserDetails.callType);
        createPeerConnection();
        sendWebRTCOffer();
    }
};

const sendWebRTCOffer = async () => {
    console.log("webrtchandler 153 working")
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log(connectedUserDetails);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId: connectedUserDetails.socketId,
        type: constants.webRTCSignaling.OFFER,
        offer: offer,
    });
}

export const handleWebRTCOffer = async (data) => {
    // console.log("165 line to trigger waiting")
    // console.log('WebRTC offer came');
    // console.log(data);
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId: connectedUserDetails.socketId,
        type: constants.webRTCSignaling.ANSWER,
        answer: answer,
    });
};

export const handleWebRTCAnswer = async (data) => {
    console.log("handling webrtc answer");
    await peerConnection.setRemoteDescription(data.answer);
};

export const handleWebRTCCandidate = async (data) => {
    try {
        await peerConnection.addIceCandidate(data.candidate);
    } catch (err) {
        console.error(
            "error occured when trying toa dd receinv3e ice candidatees",
            err
        );
    }
}

export const switchBetweenCameraAndScreenSharing = async (screenSharingActive) => {
    if (screenSharingActive) {
        const localStream = store.getState().localStream;
        const senders = peerConnection.getSenders();

        const sender = senders.find((sender) => {
            return (
                sender.track.kind === localStream.getVideoTracks()[0].kind
            );
        });

        if (sender) {
            sender.replaceTrack(localStream.getVideoTracks()[0]);
        }

        //stop sharing screen

        store.getState().screenSharingStream.getTracks().forEach((track) => track.stop());

        store.setScreenSharingActive(!screenSharingActive);

        ui.updateLocalVideo(localStream);

    } else {
        console.log('switching for screen sharing');

        try {
            screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });
            store.setScreenSharingStream(screenSharingStream);
            //replace track which sender is sending

            const senders = peerConnection.getSenders();

            const sender = senders.find((sender) => {
                return (
                    sender.track.kind === screenSharingStream.getVideoTracks()[0].kind
                );
            });

            if (sender) {
                sender.replaceTrack(screenSharingStream.getVideoTracks()[0]);
            }



            store.setScreenSharingActive(!screenSharingActive);

            ui.updateLocalVideo(screenSharingStream);

        } catch (err) {
            console.error(
                'error occured when trying to get screen shariung stream',
                err
            )
        }
    }
}


//hang up

export const handleHangUp = () => {
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId,
    };
    wss.sendUserHangedUp(data);
    closePeerConnectionAndResetState();
};

export const handleConnectedUserHangedUp = () => {
    closePeerConnectionAndResetState();
}

const closePeerConnectionAndResetState = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE ||
        connectedUserDetails.callType === constants.callType.VIDEO_STRANGER) {
        store.getState().localStream.getVideoTracks()[0].enabled = true;
        store.getState().localStream.getAudioTracks()[0].enabled = true;
    }
    ui.updateUIAfterHangUp(connectedUserDetails.callType);
    connectedUserDetails = null;
}

const checkCallPossibility = (callType) => {
    const callState = store.getState().callState;

    if (callState === constants.callState.CALL_AVAILABLE) {
        return true;
    }

    if (
        (callType === constants.callType.VIDEO_PERSONAL_CODE ||
            callType === constants.callType.VIDEO_STRANGER) &&
        callState === constants.callState.CALL_AVAILABLE_ONLY_CHAT
    ) {
        return false;
    }

    return false;
};

const setIncomingCallsAvailable = () => {
    const localStream = store.getState().localStream;
    if (localStream) {
        store.setCallState(constants.callState.CALL_AVAILABLE);
    } else {
        store.setCallState(constants.callState.CALL_AVAILABLE_ONLY_CHAT);
    }
};

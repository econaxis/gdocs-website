let API_URL = "https://gdocs-export.azurewebsites.net";

// Global csv user id variable
window.download_csv_user_id = undefined;
const developerKey = "AIzaSyAfXIJusJ26RInbyx59FNRFZzzknCacmfU";

const clientId =
    "788399211597-8v6j3e1o2sam8hltmecu1kehssvqrhmr.apps.googleusercontent.com";

const appId = "788399211597";

// Scope to use to access user's Drive items.
const scope = ["https://www.googleapis.com/auth/drive.file"];

let pickerApiLoaded = false;
let oauthToken;

function loginCallback() {
    // Start of authorization and picking sequence.
    gapi.auth.authorize(
        {
            client_id: clientId,
            scope: scope,
            immediate: false
        },
        (authResult) => {
            if (authResult && !authResult.error) {
                oauthToken = authResult.access_token;
            } else {
                console.log("Auth result error: ", authResult);
            }
            createPicker();
        }
    );
}

// Create and render a Picker object for searching images.
function createPicker() {
    if (oauthToken) {
        // TODO: filter picker to only have editable and Google Docs views
        const view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS);
        view.setSelectFolderEnabled(false);
        view.setOwnedByMe(true);
        const picker = new google.picker.PickerBuilder()
            .enableFeature(google.picker.Feature.NAV_HIDDEN)
            .setAppId(appId)
            .setOAuthToken(oauthToken)
            .addView(view)
            .setDeveloperKey(developerKey)
            .setCallback(pickerCallback)
            .build();
        picker.setVisible(true);
    } else {
        console.log("oauthToken not defined?");
    }
}

function add_csv_button(csv_user_id) {
    if (document.getElementById("download-csv-button")) {
        console.log("CSV button already exists. Not adding more");
    }
    const csv_download_url =
        API_URL + "/downloadcsv?user-id=" + csv_user_id;
    const CSV_BUTTON_HTML = `
<div class="col"> 
    <a href="${csv_download_url}" class="btn btn-primary fs-5" id="download-csv-button" style="width: 100%; height: 100%;"> Download all edits as CSV </a> </div>
`;

    document
        .getElementById("buttom-buttons-container-row")
        .insertAdjacentHTML("beforeend", CSV_BUTTON_HTML);
}

// A simple callback implementation.
function pickerCallback(data) {
    if (data.action !== google.picker.Action.PICKED) {
        return;
    }

    let download_csv_user_id ;
    fetch(API_URL + "/start", {
        method: "POST",
        body: JSON.stringify({
            file_id: data.docs[0].id,
            oauth_token: oauthToken
        }),
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
        }
    })
        .then((response) => {
            // TODO: check the CORS expose headers response in Flask?
            download_csv_user_id = response.headers.get("user-id");
            return response.json();
        })
        .then((operations) => {
            console.log("Data received: ", operations);
            draw_graph(operations, data.docs[0].name);

            add_csv_button(download_csv_user_id);
        });
}

window.addEventListener("load", function() {
    // Load API's
    gapi.load("auth");
    gapi.load("picker");

    add_csv_button("1nOVrSDsk_kJG9u6SCvVlE6cLfRmGsAmHP2b2QjtsJh0");
});

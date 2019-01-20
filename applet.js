const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Soup = imports.gi.Soup;
const UUID = "octoprint@fehlfarbe";

const _httpSession = new Soup.SessionAsync({"timeout" : 5});

function log(msg){
    global.log("[octoprint@fehlfarbe] " + msg);
}


function MyApplet(metadata, orientation, panelHeight, instance_id) {
    this._init(metadata, orientation, panelHeight, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function (metadata, orientation, panelHeight, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panelHeight, instance_id);

        // setup popup menu
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        let section = new PopupMenu.PopupMenuSection('PopupMenuSection');
        let item = new PopupMenu.PopupMenuItem('');
        this.menuLabel = new St.Label({text: 'No connection'});

        // setup settings
        this.settings = new Settings.AppletSettings(this, UUID, instance_id);
        this.bind_settings();

        // init labels
        this.set_applet_tooltip("OctoPrint progress for " + this.server);
        this.set_applet_label("OctoPrint progress");
        
        // members for current status
        this.state_job = undefined;
        this.state_printer = undefined;

        // start status update
		this.autoupdate();

        // popup menu
        item.addActor(this.menuLabel);
        section.addMenuItem(item);
        this.menu.addMenuItem(section);
        this.menuManager.addMenu(this.menu);
    },

    on_applet_clicked: function() {
        log("clicked Applet");
        if (!this.menu.isOpen && this.resp != undefined) {
            if(this.menu.setCustomStyleClass) {
                this.menu.setCustomStyleClass("click");
            }
            else if(this.menu.actor.add_style_class_name) {
                this.menu.actor.add_style_class_name("click");
            }
            // let cmd = (this.menuScript && this.menuScript.trim()) ? this.menuScript : this.script1;
            // let cmd_output = this.spawn_sync(cmd);
            // let cmd_stdout = cmd_output[0] ? cmd_output[1].toString() : _("script error");
        }
        this.menu.toggle();
    },

    on_settings_changed: function () {
        global.logError("Settings changed");
        this.bind_settings();
        this.autoupdate();
    },

    bind_settings: function () {
        for (let str of ["server", "basic_auth_user", "basic_auth_password", "api_key", "refresh_rate"]) {
            this.settings.bindProperty(Settings.BindingDirection.IN,
                str,
                str,
                null,
                null);
        }
    },

    jobURL: function() {
        return this.server + "/api/job?apikey=" + this.api_key;
    },

    printerURL(){
        return this.server + "api/printer?apikey=" + this.api_key;
    },

    loadJsonAsync: function loadJsonAsync(url, callback) {
        let context = this
        let message = Soup.Message.new('GET', url)
        // add basic auth
        if(this.basic_auth_user && this.basic_auth_password){
            let auth =new Soup.AuthBasic();
            auth.authenticate(this.basic_auth_user, this.basic_auth_password);
            let auth_header = auth.get_authorization(message);
            message.request_headers.append("Authorization", auth_header);
        }
        _httpSession.queue_message(message, function soupQueue(session, message) {
            // log("Got message callback");
            callback.call(context, message);
        })
    },

    autoupdate: function() {
        if(!this.server){
            this.update_textfield("Please setup OctoPrint URL");
            return;
        }
        this.loadJsonAsync(this.jobURL(), function(message) {
            let error = undefined;
            let error_txt = undefined;
            if(message.status_code == 200){
                // log("got JSON: " + json);
                this.state_job = JSON.parse(message.response_body.data);
            } else {
                // log("Error code" + message.status_code);
                // log("Error body" + message.response_body.data);
                error = message.status_code;
                error_txt = message.response_body.data;
            }
            this.update_textfield(error);
            this.update_popup(error_txt);
            // log("Waiting " + this.refresh_rate + "s");
            Mainloop.timeout_add_seconds(this.refresh_rate, Lang.bind(this, this.autoupdate));
        });
    },

    update_popup: function(error){
        let job = this.state_job;
        let text = "Connection error " + error;
        if(job && !error){
            switch(job["state"]){
                case "Printing":
                    let file = job["job"]["file"]["name"];
                    text = "Printing file: " + file;
                    break;
                default:
                    text = "Current state: " + job["state"];
            }
        }

        this.menuLabel.set_text(text);
    },

    update_textfield: function(error) {;
        let job = this.state_job;
        let text = "Connection Error " + error;
        if(job && !error){
            switch(job["state"].split(" ")[0]){
                case "Operational":
                    text = "Octoprint is Ready";
                    break;
                case "Printing":
                    let compl = Math.round(job["progress"]["completion"]*100)/100 + "%";
                    let timeleft = job["progress"]["printTimeLeft"];
                    let h = Math.floor((timeleft / 3600.0));
                    let m = Math.floor((timeleft / 60.0) % 60);
                    let s = Math.floor(timeleft % 60);
                    text = compl + " | " + h + "h" + m + "m" + s + "s";
                    break;
                case "Cancelling":
                    text = "Canceling job...";
                    break;
                case "Pausing":
                    text = "Pausing...";
                    break;
                case "Paused":
                    text = "Paused";
                    break;
                case "Offline":
                    text = "Printer offline";
                    break;
                default:
                    text = job["state"].length > 10 ? job["state"].substring(0,10) + "..." : job["state"];
            }
        }
        this.set_applet_label(text);
    },

    // autoupdate: function () {
    //     this.update();
    //     Mainloop.timeout_add(10 * 1000, Lang.bind(this, this.autoupdate));
    // },
};

function main(metadata, orientation, panelHeight, instance_id) {
    let myApplet = new MyApplet(metadata, orientation, panelHeight, instance_id);
    return myApplet;
}

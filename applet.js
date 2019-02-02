const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Soup = imports.gi.Soup;
const UUID = "octoprint@fehlfarbe";

const _httpSession = new Soup.SessionAsync({"timeout" : 5});

function log(msg){
    global.log("[octoprint@fehlfarbe] " + msg);
}

var PopupImageMenuItem = class PopupImageMenuItem extends PopupMenu.PopupBaseMenuItem {

    /**
     * _init:
     * @text (string): text to display in the label
     * @iconName (string): name of the icon used
     * @iconType (St.IconType): the type of icon (usually #St.IconType.SYMBOLIC
     * or #St.IconType.FULLCOLOR)
     * @params (JSON): parameters to pass to %PopupMenu.PopupBaseMenuItem._init
     */
    _init (icon, params) {
        super._init.call(this, params);
        this._icon = icon;
        this.addActor(this._icon);
    }
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
        this.section = new PopupMenu.PopupMenuSection('PopupMenuSection');

        // let item = new PopupMenu.PopupMenuItem('');
        // this.menuLabel = new St.Label({text: 'No connection'});
        // this.menuLabelTemp = new St.Label({text: 'No connection'});

        this.itemFile = new PopupMenu.PopupIconMenuItem("System state", "", St.IconType.SYMBOLIC);
        this.itemFile._icon.style_class = "printer";
        this.menuFile = new St.Icon();

        this.itemTempBed = new PopupMenu.PopupIconMenuItem("Heatbed", "", St.IconType.SYMBOLIC);
        this.itemTempBed._icon.style_class = "heatbed";
        this.menuTempBed = new St.Icon();
        this.itemTempTool0 = new PopupMenu.PopupIconMenuItem("Tool0", "", St.IconType.SYMBOLIC);
        this.itemTempTool0._icon.style_class = "hotend";
        this.menuTempTool0 = new St.Icon();

        this.menuLivestream = new St.Icon({style_class: "liveview"});
        this.itemLivestream = new PopupImageMenuItem(this.menuLivestream);
        // this.menuLivestream = new St.Icon();
        //this.itemLivestream._icon = this.menuLivestream;
        this.menuLivestream.set_icon_size(320);

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
        this.autoupdatePrinter();

        // popup menu
        this.itemFile.addActor(this.menuFile);
        this.itemTempBed.addActor(this.menuTempBed);
        this.itemTempTool0.addActor(this.menuTempTool0);
        // this.itemLivestream.addActor(this.menuLivestream);
        this.section.addMenuItem(this.itemFile);
        this.section.addMenuItem(this.itemTempBed);
        this.section.addMenuItem(this.itemTempTool0);
        this.section.addMenuItem(this.itemLivestream);
        
        // let item_p = new PopupMenu.PopupMenuItem('');
        // this.progress = new Gtk.ProgressBar();
        // item_p.addActor(this.progress);
        // section.addMenuItem(item_p);

        this.menu.addMenuItem(this.section);
        this.menuManager.addMenu(this.menu);
        
        this.toggle_livestream();
    },

    on_applet_clicked: function() {
        log("clicked Applet");
        if (!this.menu.isOpen) {
            if(this.menu.setCustomStyleClass) {
                this.menu.setCustomStyleClass("click");
            }
            else if(this.menu.actor.add_style_class_name) {
                this.menu.actor.add_style_class_name("click");
            }
        }
        this.menu.toggle();


        if(this.livestream_enable && this.menu.isOpen){
            log("autoupdate image");
            this.autoupdateImage();
        }
    },

    on_settings_changed: function () {
        log("settings changed!");
        this.toggle_livestream();
    },

    bind_settings: function () {
        for (let str of ["server", "basic_auth_enable", "basic_auth_user", "basic_auth_password", "api_key", 
                         "livestream_enable", "livestream_url", "livestream_refresh_rate", "refresh_rate"]) {
            this.settings.bindProperty(Settings.BindingDirection.IN,
                str,
                str,
                this.on_settings_changed,
                null);
        }
    },

    toggle_livestream: function(){
        if(this.livestream_enable){
            this.itemLivestream.actor.show();
        } else {
            this.itemLivestream.actor.hide();
        }
    },

    jobURL: function() {
        return this.server + "/api/job?apikey=" + this.api_key;
    },

    printerURL(){
        return this.server + "/api/printer?apikey=" + this.api_key;
    },

    loadJsonAsync: function loadJsonAsync(url, callback) {
        let context = this
        let message = Soup.Message.new('GET', url)
        // add basic auth
        if(this.basic_auth_enable && this.basic_auth_user && this.basic_auth_password){
            let auth = new Soup.AuthBasic();
            auth.authenticate(this.basic_auth_user, this.basic_auth_password);
            let auth_header = auth.get_authorization(message);
            message.request_headers.append("Authorization", auth_header);
        }
        _httpSession.queue_message(message, function soupQueue(session, message) {
            // log("Got message callback");
            callback.call(context, message);
        })
    },

    // autoupdateJob: function() {
    //     if(!this.server){
    //         this.update_textfield("Please setup OctoPrint URL");
    //         return;
    //     }
    //     this.loadJsonAsync(this.jobURL(), function(message) {
    //         let error = undefined;
    //         let error_txt = undefined;
    //         if(message.status_code == 200){
    //             this.state_job = JSON.parse(message.response_body.data);
    //         } else {
    //             error = message.status_code;
    //             error_txt = message.response_body.data;
    //         }
    //         this.update_textfield(error);
    //         this.update_popup(error_txt);
    //         // log("Waiting " + this.refresh_rate + "s");
    //         Mainloop.timeout_add_seconds(this.refresh_rate, Lang.bind(this, this.autoupdateJob));
    //     });
    // },

    autoupdatePrinter: function() {
        if(!this.server){
            this.update_textfield("Please setup OctoPrint URL");
            return;
        }
        this.loadJsonAsync(this.printerURL(), function(message) {
            // log("got printer info");
            // log(message.response_body.data);
            let error = undefined;
            let error_txt = undefined;
            if(message.status_code == 200){
                this.state_printer = JSON.parse(message.response_body.data);
            } else {
                // log("Error code" + message.status_code);
                // log("Error body" + message.response_body.data);
                error = message.status_code;
                error_txt = message.response_body.data;
            }
            //this.update_textfield(error);
            this.update_popup(error_txt);
            this.loadJsonAsync(this.jobURL(), function(message) {
                let error = undefined;
                let error_txt = undefined;
                if(message.status_code == 200){
                    this.state_job = JSON.parse(message.response_body.data);
                } else {
                    error = message.status_code;
                    error_txt = message.response_body.data;
                }
                this.update_textfield(error);
                this.update_popup(error_txt);
                log("Waiting " + this.refresh_rate + "s");
                Mainloop.timeout_add_seconds(this.refresh_rate, Lang.bind(this, this.autoupdatePrinter));
            });
        });
    },

    autoupdateImage: function() {
        this.menuLivestream.gicon = Gio.icon_new_for_string(this.livestream_url + "&t=" + Math.floor(Math.random()*10000.0));
        // this.itemLivestream.setIconName(Gio.icon_new_for_string(this.livestream_url + "&t=" + Math.floor(Math.random()*10000.0)));
        if(this.menu.isOpen){
            log("menu is open, refreshing liveview image in " + this.livestream_refresh_rate + "s...");
            Mainloop.timeout_add_seconds(this.livestream_refresh_rate, Lang.bind(this, this.autoupdateImage));
        } else {
            log("menu is closed, stop refreshing liveview image");
        }
    },

    update_popup: function(error){
        let job = this.state_job;
        let printer = this.state_printer;
        let text = "";
        if(error){
            text = "Connection error " + error;
        }

        // add job state
        if(job && !error){
            switch(job["state"]){
                case "Printing":
                    text = job["job"]["file"]["name"];
                    break;
                default:
                    text = "Current state " + job["state"];
            }
        }
        log(error)
        this.itemFile.label.text = text;

        // add printer state
        if(printer && !error){
            // text = "\n\nTemperatures:\n"
            //      + "---------------\n"
            // for(var key in printer["temperature"]) {
            //     text += key + ":\t"
            //          + printer["temperature"][key]["actual"] + " / "
            //          + printer["temperature"][key]["target"] + " °C\n";
            // }
            if(printer.temperature.bed){
                this.itemTempBed.label.text = printer.temperature.bed.actual + " / "
                                            + printer.temperature.bed.target + " °C";
            } else {
                this.itemTempBed.label.text = "unknown";
            }
            if(printer.temperature.tool0){
                this.itemTempTool0.label.text = printer.temperature.tool0.actual + " / "
                                              + printer.temperature.tool0.target + " °C";
            } else {
                this.itemTempTool0.label.text = "unknown";
            }
        }
        
        
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
};

function main(metadata, orientation, panelHeight, instance_id) {
    let myApplet = new MyApplet(metadata, orientation, panelHeight, instance_id);
    return myApplet;
}

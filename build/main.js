var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
var import_bonjour_service = __toESM(require("bonjour-service"));
var dns = __toESM(require("dns"));
var import_decryptAES256 = require("./decryptAES256");
class AirQ extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "air-q"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
  }
  async onReady() {
    await this.setObjectNotExistsAsync("connection", {
      type: "state",
      common: {
        name: "connection",
        type: "boolean",
        role: "indicator.reachable",
        read: true,
        write: false
      },
      native: {}
    });
    this.setState("connection", { val: false, ack: true });
    this.checkSearchOption();
    try {
      this.id = this.config.shortId;
      this.password = this.config.password;
      this.deviceName = this.id.concat("_air-q");
    } catch (error) {
      this.log.error(error);
    }
    await this.setObjectNotExistsAsync("Sensors", {
      type: "device",
      common: {
        name: this.deviceName
      },
      native: {}
    });
    await this.setObjectNotExistsAsync(`Sensors.health`, {
      type: "state",
      common: {
        name: "health",
        type: "number",
        role: "value",
        read: true,
        write: true
      },
      native: {}
    });
    await this.setObjectNotExistsAsync(`Sensors.performance`, {
      type: "state",
      common: {
        name: "performance",
        type: "number",
        role: "value",
        read: true,
        write: true
      },
      native: {}
    });
    this.sensorArray = await this.getSensorsInDevice();
    for (const element of this.sensorArray) {
      await this.setObjectNotExistsAsync(`Sensors.${element}`, {
        type: "state",
        common: {
          name: element,
          type: "number",
          role: "value",
          read: true,
          write: true
        },
        native: {}
      });
      this.subscribeStates(`Sensors.${element}`);
    }
    this.setInterval(async () => {
      await this.setStates();
    }, this.config.retrievalRate * 1e3);
  }
  async checkSearchOption() {
    if (this.config.searchViaIP) {
      this.service = "";
      this.ip = this.deviceIP;
    } else {
      this.service = await this.findAirQInNetwork();
      this.ip = await this.getIp();
    }
  }
  async findAirQInNetwork() {
    return new Promise((resolve, reject) => {
      const instance = new import_bonjour_service.default();
      const config = { type: "http" };
      const findAirQ = instance.find(config, (service) => {
        if (service.name === this.deviceName) {
          findAirQ.stop();
          this.setState("connection", { val: true, ack: true });
          resolve(service);
        }
      });
      setTimeout(() => {
        findAirQ.stop();
        reject(new Error("AirQ not found in network"));
      }, 5e4);
    });
  }
  async getIp() {
    return new Promise((resolve, reject) => {
      dns.lookup(this.service.name, 4, (err, address) => {
        if (err) {
          reject(err);
        } else {
          resolve(address);
        }
      });
    });
  }
  async getDataFromAirQ() {
    try {
      const response = await import_axios.default.get(`http://${this.ip}/data`, { responseType: "json" });
      const data = response.data.content;
      const decryptedData = (0, import_decryptAES256.decrypt)(data, this.password);
      if (decryptedData && typeof decryptedData === "object") {
        const sensorsData = decryptedData;
        return sensorsData;
      } else {
        throw new Error("DecryptedData is undefined or not an object");
      }
    } catch {
      this.log.error("Error while getting data from AirQ");
    }
  }
  async getAverageDataFromAirQ() {
    try {
      const response = await import_axios.default.get(`http://${this.ip}/average`, { responseType: "json" });
      const data = response.data.content;
      const decryptedData = (0, import_decryptAES256.decrypt)(data, this.password);
      if (decryptedData && typeof decryptedData === "object") {
        const sensorsData = decryptedData;
        return sensorsData;
      } else {
        throw new Error("DecryptedData is undefined or not an object");
      }
    } catch (error) {
      throw error;
    }
  }
  async getSensorsInDevice() {
    try {
      const response = await import_axios.default.get(`http://${this.ip}/config`, { responseType: "json" });
      const data = response.data.content;
      const decryptedData = (0, import_decryptAES256.decrypt)(data, this.password);
      if (decryptedData && typeof decryptedData === "object") {
        const sensorsData = decryptedData;
        const sensors = this.checkParticulates(sensorsData.sensors);
        return sensors;
      } else {
        throw new Error("DecryptedData is undefined or not an object");
      }
    } catch (error) {
      throw error;
    }
  }
  checkParticulates(data) {
    if (data.includes("particulates")) {
      const pm = ["pm1", "pm2_5", "pm10"];
      const index = data.indexOf("particulates");
      data.splice(index, 1);
      data.splice(index, 0, ...pm);
      return data;
    } else {
      return data;
    }
  }
  getRetrievalType() {
    return this.config.retrievalType;
  }
  onStateChange(id, state) {
    const value = state == null ? void 0 : state.val;
    if (state) {
      this.getStateAsync(id, { val: value, ack: true });
    } else {
      this.log.info(`State ${id} deleted`);
    }
  }
  async setStates() {
    try {
      this.getRetrievalType() === "data" ? this.setSensorData() : this.setSensorAverageData();
      this.onStateChange("Sensors.health", await this.getStateAsync("Sensors.health"));
      this.onStateChange("Sensors.performance", await this.getStateAsync("Sensors.performance"));
      for (const element of this.sensorArray) {
        const state = await this.getStateAsync(`Sensors.${element}`);
        this.onStateChange(`Sensors.${element}`, state);
      }
    } catch {
      this.log.error("Error while setting states");
    }
  }
  async setSensorData() {
    try {
      const data = await this.getDataFromAirQ();
      for (const element of this.sensorArray) {
        if (this.config.rawData) {
          this.setStateAsync(`Sensors.${element}`, { val: data[element][0], ack: true });
        } else {
          this.checkNegativeValues(data, element) ? this.setStateAsync(`Sensors.${element}`, { val: 0, ack: true }) : this.setStateAsync(`Sensors.${element}`, { val: data[element][0], ack: true });
        }
      }
      this.setStateAsync("Sensors.health", { val: data.health / 10, ack: true });
      this.setStateAsync("Sensors.performance", { val: data.performance / 10, ack: true });
    } catch {
      this.log.error("Error while setting data from AirQ");
    }
  }
  async setSensorAverageData() {
    try {
      const data = await this.getAverageDataFromAirQ();
      for (const element of this.sensorArray) {
        if (!this.config.rawData) {
          this.checkNegativeValues(data, element) ? this.setStateAsync(`Sensors.${element}`, { val: 0, ack: true }) : this.setStateAsync(`Sensors.${element}`, { val: data[element][0], ack: true });
        } else {
          this.setStateAsync(`Sensors.${element}`, { val: data[element][0], ack: true });
        }
      }
      this.setStateAsync("Sensors.health", { val: data.health / 10, ack: true });
      this.setStateAsync("Sensors.performance", { val: data.performance / 10, ack: true });
    } catch {
      this.log.error("Error while setting average data from AirQ");
    }
  }
  checkNegativeValues(data, element) {
    if (data[element][0] < 0 && element !== "temperature") {
      return true;
    } else {
      return false;
    }
  }
  set service(value) {
    try {
      this._service = value;
    } catch {
      this.log.error("Error while setting service");
    }
  }
  get service() {
    return this._service;
  }
  set ip(value) {
    try {
      this._ip = value;
    } catch {
      this.log.error("Error while setting ip");
    }
  }
  get ip() {
    return this._ip;
  }
  set sensorArray(value) {
    try {
      this._sensorArray = value;
    } catch {
      this.log.error("Error while setting sensorArray");
    }
  }
  get sensorArray() {
    return this._sensorArray;
  }
  set id(value) {
    try {
      this._id = value;
    } catch {
      this.log.error("Error while setting id. Check your instance settings.");
    }
  }
  get id() {
    return this._id;
  }
  set password(value) {
    try {
      this._password = value;
    } catch {
      this.log.error("Error while setting password. Check your instance settings.");
    }
  }
  get password() {
    return this._password;
  }
  set deviceName(value) {
    try {
      this._deviceName = value;
    } catch {
      this.log.error("Error while setting deviceName");
    }
  }
  get deviceName() {
    return this._deviceName;
  }
  get deviceIP() {
    return this.config.deviceIP;
  }
}
if (require.main !== module) {
  module.exports = (options) => new AirQ(options);
} else {
  (() => new AirQ())();
}
//# sourceMappingURL=main.js.map

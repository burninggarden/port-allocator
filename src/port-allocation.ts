
class PortAllocation {

	private httpPort : number;
	private tcpPort  : number;

	public constructor(httpPort: number, tcpPort: number) {
		this.httpPort = httpPort;
		this.tcpPort  = tcpPort;
	}

	public getHttpPort(): number {
		return this.httpPort;
	}

	public getTcpPort(): number {
		return this.tcpPort;
	}

}

export default PortAllocation;

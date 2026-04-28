<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use App\Services\ReportBuilder;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ReportController extends Controller
{
    public function __construct(private ReportBuilder $reports) {}

    public function download(Request $request, int $scan): BinaryFileResponse
    {
        $scanModel = Scan::findOrFail($scan);

        if (! in_array($scanModel->status, ['complete', 'failed'], true)) {
            abort(409, 'Scan is not yet complete.');
        }

        $zipPath = $this->reports->buildForScan($scanModel);
        $downloadName = $this->reports->filenameFor($scanModel).'.zip';

        return response()->download($zipPath, $downloadName, [
            'Content-Type' => 'application/zip',
        ])->deleteFileAfterSend(true);
    }
}
